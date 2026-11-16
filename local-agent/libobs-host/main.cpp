/*
 * SWAPP Live libobs host — GPL-2.0-or-later.
 * Build separately against the official OBS Studio libobs SDK.
 * This program uses libobs directly: it does not run or embed OBS Studio's UI.
 * All streaming targets are localhost and the process exits when its parent closes stdin.
 */
#include <obs.h>
#include <algorithm>
#include <chrono>
#include <filesystem>
#include <iostream>
#include <map>
#include <string>
#include <thread>

namespace fs = std::filesystem;

struct Options {
 std::string rtmp, key, source = "game", encoder = "auto";
 unsigned display = 0, fps = 30, bitrate = 6000;
};

static bool read_args(int argc, char **argv, Options &o) {
 std::map<std::string, std::string> vals;
 for (int i = 1; i + 1 < argc; i += 2) {
  const std::string k = argv[i];
  if (k.rfind("--", 0) != 0 || vals.count(k)) return false;
  vals.emplace(k, argv[i + 1]);
 }
 if (argc % 2 == 0) return false;
 try {
  o.rtmp = vals.at("--rtmp");
  o.key = vals.at("--key");
  o.source = vals.at("--source");
  o.encoder = vals.at("--encoder");
  o.display = static_cast<unsigned>(std::stoul(vals.at("--display")));
  o.fps = static_cast<unsigned>(std::stoul(vals.at("--fps")));
  o.bitrate = static_cast<unsigned>(std::stoul(vals.at("--bitrate")));
 } catch (...) { return false; }
 // Never act as an arbitrary RTMP publisher. SWAPP registers its public HLS separately.
 if (o.rtmp != "rtmp://127.0.0.1:1935/live" &&
     o.rtmp.rfind("rtmp://127.0.0.1:", 0) != 0) return false;
 if (o.rtmp.find("/live") == std::string::npos ||
     o.rtmp.find_first_of(" \t\n\r") != std::string::npos) return false;
 if (o.key.empty() || o.key.size() > 128 ||
     !std::all_of(o.key.begin(), o.key.end(), [](unsigned char c) {
      return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
             (c >= '0' && c <= '9') || c == '-' || c == '_';
     })) return false;
 if ((o.source != "game" && o.source != "display") ||
     (o.encoder != "auto" && o.encoder != "nvenc" && o.encoder != "x264") ||
     (o.fps != 30 && o.fps != 60) || o.display > 3 ||
     o.bitrate < 2500 || o.bitrate > 10000) return false;
 return true;
}

static bool configure_plugins(const fs::path &exe) {
 // OBS 33's public obs_load_core_modules() loads *all* official modules,
 // including frontend-tools.dll, which assumes the actual OBS GUI frontend.
 // SWAPP has no OBS GUI callbacks, so load only the capture/encode/output
 // modules we explicitly need, using documented obs_open_module/init_module.
 fs::current_path(exe);
 const fs::path runtime=fs::weakly_canonical(exe/".."/"..");
 const fs::path core=runtime/"core";
 const std::string libobsData=(runtime/"data"/"libobs").string();
 obs_add_data_path(libobsData.c_str());

 const char *required[]={
  "win-capture","win-wasapi","win-dshow",
  "obs-ffmpeg","obs-x264","obs-outputs","rtmp-services"
 };
 auto load=[&](const char *name,bool mandatory){
  const fs::path binary=core/name/(std::string(name)+".dll");
  const fs::path data=core/name/"data";
  if(!fs::exists(binary)){
   if(mandatory)std::cerr<<"Missing OBS module: "<<binary.string()<<std::endl;
   return !mandatory;
  }
  obs_module_t *module=nullptr;
  int status=obs_open_module(&module,binary.string().c_str(),data.string().c_str());
  if(status!=MODULE_SUCCESS||!module){
   if(mandatory)std::cerr<<"Failed opening OBS module "<<name<<" code "<<status<<std::endl;
   return !mandatory;
  }
  if(!obs_init_module(module)){
   if(mandatory)std::cerr<<"Failed initializing OBS module "<<name<<std::endl;
   return !mandatory;
  }
  std::cout<<"Loaded native OBS module: "<<name<<std::endl;
  return true;
 };
 for(const char *name:required){
  if(!load(name,true))return false;
 }
 // NVENC may fail on PCs without a compatible NVIDIA driver. x264 remains.
 load("obs-nvenc",false);
 obs_post_load_modules();
 return true;
}

static obs_source_t *make_source(const char *id, const char *name, obs_data_t *settings) {
 auto *source = obs_source_create(id, name, settings, nullptr);
 if (!source) std::cerr << "Module/source libobs absent : " << id << std::endl;
 return source;
}

static obs_encoder_t *make_video_encoder(const Options &o) {
 const char *ids[2] = { "obs_nvenc_h264_tex", "obs_x264" };
 obs_encoder_t *encoder = nullptr;
 for (auto *id : ids) {
  if (o.encoder == "nvenc" && std::string(id) != "obs_nvenc_h264_tex") continue;
  if (o.encoder == "x264" && std::string(id) != "obs_x264") continue;
  obs_data_t *settings = obs_data_create();
  obs_data_set_int(settings, "bitrate", o.bitrate);
  obs_data_set_string(settings, "rate_control", "CBR");
  obs_data_set_int(settings, "keyint_sec", 2);
  if (std::string(id) == "obs_x264")
   obs_data_set_string(settings, "preset", "veryfast");
  else
   obs_data_set_string(settings, "preset", "p4");
  encoder = obs_video_encoder_create(id, "SWAPP H264", settings, nullptr);
  obs_data_release(settings);
  if (encoder) {
   std::cerr << "Video encoder: " << id << std::endl;
   break;
  }
 }
 return encoder;
}

int main(int argc, char **argv) {
 // Safe, non-streaming module check for headless Windows build runners.
 // Verifies real Game Capture and WASAPI plugin registration without GPU hooks.
 if(argc==2 && std::string(argv[1])=="--selftest") {
  const fs::path root=fs::absolute(fs::path(argv[0])).parent_path();
  if(!obs_startup("fr-FR",nullptr,nullptr)) {
   std::cerr << "libobs startup failed" << std::endl;return 10;
  }
  if(!configure_plugins(root)){obs_shutdown();return 12;}
  const char *ids[]={"game_capture","monitor_capture",
   "wasapi_output_capture","wasapi_input_capture"};
  bool valid=true;
  for(auto *name:ids) {
   const char *label=obs_source_get_display_name(name);
   if(!label) {
    std::cerr << "Missing native source plugin: " << name << std::endl;
    valid=false;
   } else std::cout << name << ": " << label << std::endl;
  }
  obs_shutdown();
  return valid?0:11;
 }
 Options opt;
 if (!read_args(argc, argv, opt)) {
  std::cerr << "SWAPP libobs: invalid arguments (only local RTMP allowed)" << std::endl;
  return 2;
 }
 const fs::path root = fs::absolute(fs::path(argv[0])).parent_path();
 if (!obs_startup("fr-FR", nullptr, nullptr)) {
  std::cerr << "obs_startup failed" << std::endl;
  return 3;
 }

 obs_scene_t *scene = nullptr;
 obs_source_t *visual = nullptr, *desktop = nullptr, *mic = nullptr;
 obs_encoder_t *video = nullptr, *audio = nullptr;
 obs_service_t *service = nullptr;
 obs_output_t *output = nullptr;
 int result = 4;

 do {
  obs_video_info v = {};
  v.graphics_module = "libobs-d3d11.dll";
  v.fps_num = opt.fps;
  v.fps_den = 1;
  v.base_width = 1920;
  v.base_height = 1080;
  v.output_width = 1920;
  v.output_height = 1080;
  v.output_format = VIDEO_FORMAT_NV12;
  v.colorspace = VIDEO_CS_709;
  v.range = VIDEO_RANGE_PARTIAL;
  v.scale_type = OBS_SCALE_BICUBIC;
  v.gpu_conversion = true;
  if (obs_reset_video(&v) != OBS_VIDEO_SUCCESS) {
   std::cerr << "obs_reset_video failed: graphics runtime missing?" << std::endl;
   break;
  }
  obs_audio_info a = {};
  a.samples_per_sec = 48000;
  a.speakers = SPEAKERS_STEREO;
  if (!obs_reset_audio(&a)) {
   std::cerr << "obs_reset_audio failed" << std::endl;
   break;
  }

  if(!configure_plugins(root))break;

  obs_data_t *video_settings = obs_data_create();
  if (opt.source == "game") {
   obs_data_set_string(video_settings, "capture_mode", "any_fullscreen");
   // Anti-cheat compatibility mode does not bypass anti-cheat protections.
   obs_data_set_bool(video_settings, "anti_cheat_hook", true);
  } else {
   obs_data_set_int(video_settings, "monitor", opt.display);
   obs_data_set_bool(video_settings, "capture_cursor", true);
  }
  visual = make_source(opt.source == "game" ? "game_capture" : "monitor_capture",
                       "SWAPP Video", video_settings);
  obs_data_release(video_settings);
  if (!visual) break;

  scene = obs_scene_create("SWAPP Live");
  if (!scene) break;
  obs_scene_add(scene, visual);

  // Windows loopback and microphone work without Stereo Mix / DirectShow.
  // They are put inside the single scene so libobs mixes the two on audio track 1.
  obs_data_t *audio_settings = obs_data_create();
  obs_data_set_string(audio_settings, "device_id", "default");
  desktop = make_source("wasapi_output_capture", "SWAPP Desktop Audio", audio_settings);
  mic = make_source("wasapi_input_capture", "SWAPP Microphone", audio_settings);
  obs_data_release(audio_settings);
  // A PC can have no microphone, disconnected headphones, or missing audio devices.
  // Capture whichever WASAPI sources exist; do not reject a working game video
  // solely because a microphone is absent. Missing sources may mean silent audio.
  if (desktop) obs_scene_add(scene, desktop);
  else std::cerr << "Desktop audio unavailable; stream may be silent" << std::endl;
  if (mic) obs_scene_add(scene, mic);
  else std::cerr << "Microphone unavailable; continue without voice" << std::endl;
  obs_set_output_source(0, obs_scene_get_source(scene));

  video = make_video_encoder(opt);
  obs_data_t *audio_options = obs_data_create();
  obs_data_set_int(audio_options, "bitrate", 160);
  audio = obs_audio_encoder_create("ffmpeg_aac", "SWAPP AAC", audio_options, 0, nullptr);
  obs_data_release(audio_options);
  if (!video || !audio) {
   std::cerr << "Video or AAC encoder missing" << std::endl;
   break;
  }
  obs_encoder_set_video(video, obs_get_video());
  obs_encoder_set_audio(audio, obs_get_audio());

  obs_data_t *service_options = obs_data_create();
  obs_data_set_string(service_options, "server", opt.rtmp.c_str());
  obs_data_set_string(service_options, "key", opt.key.c_str());
  service = obs_service_create("rtmp_custom", "SWAPP Local RTMP", service_options, nullptr);
  obs_data_release(service_options);
  output = obs_output_create("rtmp_output", "SWAPP Output", nullptr, nullptr);
  if (!service || !output) {
   std::cerr << "RTMP plugin missing" << std::endl;
   break;
  }
  obs_output_set_video_encoder(output, video);
  obs_output_set_audio_encoder(output, audio, 0);
  obs_output_set_service(output, service);
  if (!obs_output_start(output)) {
   std::cerr << "OBS RTMP output start failed: "
             << (obs_output_get_last_error(output) ? obs_output_get_last_error(output) : "")
             << std::endl;
   break;
  }
  std::cout << "SWAPP_LIBOBS_STARTED" << std::endl;

  // Closing SWAPP Live (or pressing Stop) closes stdin. We then release all capture
  // sources and output handles; no hidden OBS window/process remains running.
  std::string command;
  while (std::getline(std::cin, command)) {
   if (command == "stop") break;
   if (!obs_output_active(output)) {
    std::cerr << "RTMP output stopped unexpectedly" << std::endl;
    break;
   }
  }
  result = 0;
 } while (false);

 if (output) {
  if (obs_output_active(output)) {
   obs_output_stop(output);
   // OBS stop is asynchronous: allow RTMP to drain, then force stop if needed.
   for (unsigned i = 0; i < 100 && obs_output_active(output); ++i)
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
   if (obs_output_active(output)) obs_output_force_stop(output);
  }
  obs_output_release(output);
 }
 if (video) obs_encoder_release(video);
 if (audio) obs_encoder_release(audio);
 if (service) obs_service_release(service);
 obs_set_output_source(0, nullptr);
 if (scene) obs_scene_release(scene);
 if (visual) obs_source_release(visual);
 if (desktop) obs_source_release(desktop);
 if (mic) obs_source_release(mic);
 obs_shutdown();
 return result;
}
