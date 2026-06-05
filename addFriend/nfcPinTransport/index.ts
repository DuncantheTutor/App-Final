export {
  encodeNfcPinPairNdefPayload,
  encodeNfcPairOfferNdefPayload,
  encodeQrPairOfferPayload,
  parseNfcPairOfferPlaintext,
  parsePinFromNfcPairPlaintext,
  parseQrPairOfferPlaintext,
  isLegacyPairingPin,
  isOpaquePairingToken,
  normalizePairingOfferCode,
  PAIRING_OFFER_TOKEN_HEX_LEN,
} from "./pairOfferProtocol";
