package com.erdos

import android.util.Base64
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.spec.ECGenParameterSpec
import java.util.UUID

@ReactModule(name = PairingAttestationModule.NAME)
class PairingAttestationModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "ErdosPairingAttestation"
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun createAttestation(challengeB64: String, promise: Promise) {
    try {
      val challenge = Base64.decode(challengeB64, Base64.NO_WRAP)
      if (challenge.isEmpty() || challenge.size > 128) {
        promise.reject("E_CHALLENGE", "Invalid attestation challenge.")
        return
      }
      val keyStore = KeyStore.getInstance("AndroidKeyStore")
      keyStore.load(null)
      val alias = "erdos.pairing." + UUID.randomUUID().toString()
      try {
        val generator = KeyPairGenerator.getInstance(
          KeyProperties.KEY_ALGORITHM_EC,
          "AndroidKeyStore"
        )
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
          .setDigests(KeyProperties.DIGEST_SHA256)
          .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
          .setAttestationChallenge(challenge)
          .build()
        generator.initialize(spec)
        generator.generateKeyPair()
        val chain = keyStore.getCertificateChain(alias)
          ?: throw IllegalStateException("Android did not return an attestation certificate.")
        val encoded = Arguments.createArray()
        for (cert in chain) {
          encoded.pushString(Base64.encodeToString(cert.encoded, Base64.NO_WRAP))
        }
        promise.resolve(encoded)
      } finally {
        try {
          keyStore.deleteEntry(alias)
        } catch (_: Exception) {
        }
      }
    } catch (e: Exception) {
      promise.reject("E_ATTEST", e.message, e)
    }
  }
}
