import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const bridgeSource = readFileSync(new URL("../browser-extension/monitor-bridge.js", import.meta.url), "utf8");

test("repeated bridge injection installs only one event-forwarding listener", () => {
  const listeners = [];
  const sent = [];
  const fakeWindow = {
    addEventListener(type, listener) {
      if (type === "message") listeners.push(listener);
    }
  };
  const context = {
    window: fakeWindow,
    chrome: {runtime: {sendMessage: message => sent.push(message)}}
  };

  runInNewContext(bridgeSource, context);
  runInNewContext(bridgeSource, context);
  runInNewContext(bridgeSource, context);
  runInNewContext(bridgeSource, context);
  runInNewContext(bridgeSource, context);
  runInNewContext(bridgeSource, context);

  assert.equal(listeners.length, 1, "only one bridge listener should be registered");
  listeners[0]({
    source: fakeWindow,
    data: {
      source: "openguin-netwatch",
      event: {kind: "fetch-response", host: "chatgpt.com", status: 200}
    }
  });
  assert.equal(sent.length, 1, "one page event should be forwarded exactly once");
  assert.equal(sent[0].type, "openguin-network-event");
});
