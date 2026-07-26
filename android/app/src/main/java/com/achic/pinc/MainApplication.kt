package com.achic.pinc

import android.app.Application
import android.content.res.Configuration
import android.content.Context
import android.content.res.Resources
import android.os.Build
import androidx.annotation.NonNull

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.config.ReactFeatureFlags
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.flipper.ReactNativeFlipper
import com.facebook.soloader.SoLoader

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

import androidx.appcompat.app.AppCompatDelegate

class MainApplication : Application(), ReactApplication {

  override fun attachBaseContext(base: Context) {
    val configuration = Configuration(base.resources.configuration)
    configuration.uiMode = (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or Configuration.UI_MODE_NIGHT_NO
    val context = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
      base.createConfigurationContext(configuration)
    } else {
      base
    }
    super.attachBaseContext(context)
  }

  override fun getResources(): Resources {
    val res = super.getResources()
    val config = Configuration(res.configuration)
    config.uiMode = (config.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or Configuration.UI_MODE_NIGHT_NO
    res.updateConfiguration(config, res.displayMetrics)
    return res
  }

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
        this,
        object : DefaultReactNativeHost(this) {
          override fun getPackages(): List<ReactPackage> {
            // Packages that cannot be autolinked yet can be added manually here, for example:
            // packages.add(new MyReactNativePackage());
            return PackageList(this).packages
          }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
          override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = getDefaultReactHost(this.applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
    SoLoader.init(this, false)
    if (!BuildConfig.REACT_NATIVE_UNSTABLE_USE_RUNTIME_SCHEDULER_ALWAYS) {
      ReactFeatureFlags.unstable_useRuntimeSchedulerAlways = false
    }
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    if (BuildConfig.DEBUG) {
      ReactNativeFlipper.initializeFlipper(this, reactNativeHost.reactInstanceManager)
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
