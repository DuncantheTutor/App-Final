import assert from "node:assert/strict";
import { test } from "node:test";

import { deviceNetworkLooksOnline } from "./deviceNetworkOnline.ts";

test("a recognised connection is online", () => {
  assert.equal(deviceNetworkLooksOnline({ isConnected: true, isInternetReachable: true }), true);
});

test("an active network with an unnamed transport is online", () => {
  assert.equal(deviceNetworkLooksOnline({ isConnected: false, isInternetReachable: true }), true);
});

test("both flags false is offline", () => {
  assert.equal(deviceNetworkLooksOnline({ isConnected: false, isInternetReachable: false }), false);
});

test("unknown probe does not force the offline banner", () => {
  assert.equal(deviceNetworkLooksOnline({ isConnected: null, isInternetReachable: null }), true);
  assert.equal(deviceNetworkLooksOnline(null), true);
});
