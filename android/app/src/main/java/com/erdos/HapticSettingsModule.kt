package com.erdos

import android.content.Context
import android.os.Build
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = HapticSettingsModule.NAME)
class HapticSettingsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "ErdosHapticSettings"
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun isSystemHapticEnabled(promise: Promise) {
    try {
      promise.resolve(readSystemHapticEnabled())
    } catch (_: Exception) {
      promise.resolve(true)
    }
  }

  private fun readSystemHapticEnabled(): Boolean {
    if (!hasVibrator()) return false
    return Settings.System.getInt(
      reactApplicationContext.contentResolver,
      Settings.System.HAPTIC_FEEDBACK_ENABLED,
      1
    ) == 1
  }

  private fun hasVibrator(): Boolean {
    val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val manager = reactApplicationContext.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
      manager?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      reactApplicationContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
    return vibrator?.hasVibrator() == true
  }
}
