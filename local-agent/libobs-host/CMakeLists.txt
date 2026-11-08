cmake_minimum_required(VERSION 3.28)
project(swapp_libobs_host LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "SWAPP libobs host currently targets Windows only")
endif()

# Use an OBS Studio development build/export (or installed libobs SDK).
# OBS official Windows portable ZIP does not include every development header.
find_package(libobs CONFIG REQUIRED)

add_executable(swapp-libobs-host main.cpp)
target_compile_features(swapp-libobs-host PRIVATE cxx_std_17)
target_link_libraries(swapp-libobs-host PRIVATE OBS::libobs)

if(MSVC)
  target_compile_options(swapp-libobs-host PRIVATE /W4 /EHsc)
endif()

install(TARGETS swapp-libobs-host RUNTIME DESTINATION .)
