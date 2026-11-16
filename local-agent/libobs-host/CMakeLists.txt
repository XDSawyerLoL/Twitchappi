cmake_minimum_required(VERSION 3.28)
project(swapp_libobs_host LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "SWAPP libobs host is Windows x64 only")
endif()

# OBS Windows ZIP does not ship a development SDK; bootstrap script generates
# an exact-version import library from obs.dll exports with official headers.
set(SWAPP_OBS_SDK "" CACHE PATH "Verified SDK from bootstrap-obs33-windows.ps1")
set(SWAPP_OBS_SOURCE "" CACHE PATH "Verified official OBS source tree")
set(SWAPP_OBS_ROOT "" CACHE PATH "Verified official OBS runtime")

if(SWAPP_OBS_SDK AND SWAPP_OBS_SOURCE AND SWAPP_OBS_ROOT)
  if(NOT EXISTS "${SWAPP_OBS_SDK}/lib/obs.lib")
    message(FATAL_ERROR "Missing SDK obs.lib generated from official obs.dll")
  endif()
  if(NOT EXISTS "${SWAPP_OBS_ROOT}/bin/64bit/obs.dll")
    message(FATAL_ERROR "Missing matching OBS runtime obs.dll")
  endif()
  add_library(OBS::libobs SHARED IMPORTED GLOBAL)
  set_target_properties(OBS::libobs PROPERTIES
    IMPORTED_IMPLIB "${SWAPP_OBS_SDK}/lib/obs.lib"
    IMPORTED_LOCATION "${SWAPP_OBS_ROOT}/bin/64bit/obs.dll"
    INTERFACE_INCLUDE_DIRECTORIES "${SWAPP_OBS_SOURCE}/libobs;${SWAPP_OBS_SDK}/config")
else()
  find_package(libobs CONFIG REQUIRED)
endif()

add_executable(swapp-libobs-host main.cpp)
target_compile_features(swapp-libobs-host PRIVATE cxx_std_17)
target_link_libraries(swapp-libobs-host PRIVATE OBS::libobs)

if(MSVC)
  target_compile_options(swapp-libobs-host PRIVATE /W4 /EHsc /utf-8)
endif()

install(TARGETS swapp-libobs-host RUNTIME DESTINATION .)
