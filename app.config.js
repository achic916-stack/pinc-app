export default {
  "expo": {
    "name": "pinc",
    "slug": "pinc",
    "version": "1.0.6",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "backgroundColor": "#14141e",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#FFFFFF"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": false,
      "usesAppleSignIn": true,
      "bundleIdentifier": "com.achic.pinc",
      "buildNumber": "161",
      "googleServicesFile": "./GoogleService-Info.plist",
      "config": {
        "googleMapsApiKey": process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "dummy_key_to_prevent_crash"
      },
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "pinc uses your GPS location to verify if you are within 50 meters of the venue for the Live Reality Check.",
        "NSMicrophoneUsageDescription": "pinc uses your microphone to record audio for videos.",
        "ITSAppUsesNonExemptEncryption": false,
        "CFBundleURLTypes": [
          {
            "CFBundleURLSchemes": [
              "com.googleusercontent.apps.929703082491-4d1jqjf73mif9i46c4t8166t1girkmvn"
            ]
          }
        ]
      }
    },
    "android": {
      "package": "com.achic.pinc",
      "versionCode": 149,
      "config": {
        "googleMaps": {
          "apiKey": process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ""
        }
      },
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FDFBF7"
      },
      "permissions": [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.RECORD_AUDIO",
        "com.android.vending.BILLING"
      ]
    },
    "plugins": [
      "./plugins/withAndroidBuildGradleFix",
      [
        "expo-location",
        {
          "locationAlwaysAndWhenInUsePermission": "Allow pinc to use your location."
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow pinc to access your photos to set a profile picture.",
          "cameraPermission": "Allow pinc to access your camera to take reality check photos.",
          "microphonePermission": "Allow pinc to access your microphone to record audio with videos."
        }
      ],
      [
        "expo-build-properties",
        {
          "ios": {
            "deploymentTarget": "15.0",
            "useGoogleMaps": true
          },
          "android": {
            "compileSdkVersion": 35,
            "targetSdkVersion": 35,
            "jvmArgs": [
              "-Xmx3G"
            ],
            "packagingOptions": {
              "pickFirst": [
                "META-INF/DEPENDENCIES",
                "META-INF/LICENSE",
                "META-INF/NOTICE",
                "META-INF/LICENSE.txt",
                "META-INF/NOTICE.txt",
                "META-INF/AL2.0",
                "META-INF/LGPL2.1",
                "lib/**/libjsi.so",
                "lib/**/libc++_shared.so",
                "lib/**/libfbjni.so",
                "lib/**/libreactnativejni.so"
              ]
            }
          }
        }
      ],
      [
        "@react-native-google-signin/google-signin",
        {
          "iosUrlScheme": "com.googleusercontent.apps.929703082491-4d1jqjf73mif9i46c4t8166t1girkmvn"
        }
      ],
      "expo-localization",
      "expo-apple-authentication"
    ],
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "extra": {
      "eas": {
        "projectId": "199b8f63-e7c8-4d7c-b9d5-4c67f35ddf9c"
      }
    }
  }
};
