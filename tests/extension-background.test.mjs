import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source = readFileSync(new URL("../browser-extension/background.js", import.meta.url), "utf8");

function makeHarness() {
  const localState = {monitoring:true,activeTabId:7,activeHost:"chatgpt.com",events:[]};
  const sessionState = {};
  let messageListener;
  const hook = () => ({addListener(){}});
  const chrome = {
    runtime: {onMessage:{addListener(listener){messageListener=listener;}}},
    storage: {
      local: {
        async get(defaults={}) { return {...defaults,...localState}; },
        async set(values) { Object.assign(localState,values); }
      },
      session: {
        async get(defaults={}) { return {...defaults,...sessionState}; },
        async set(values) { Object.assign(sessionState,values); },
        async remove(key) { delete sessionState[key]; }
      }
    },
    tabs: {onUpdated:hook(),onRemoved:hook()},
    downloads: {onCreated:hook(),onChanged:hook(),async search(){return [];}},
    alarms: {onAlarm:hook(),create(){},async clear(){}},
    permissions: {
      async contains(){return false;},
      onAdded:hook(),onRemoved:hook()
    }
  };
  runInNewContext(source,{chrome,URL,Date,Math,Number,Set,Map,String,Object,Promise,JSON});
  return {localState,send(message,sender){messageListener(message,sender);}};
}

test("background stores one copy of a repeated page event and records source timing", async () => {
  const h = makeHarness();
  const sourceAt = Date.now();
  const event = {
    kind:"fetch-response",host:"chatgpt.com",path:"/backend-api/conversation",
    method:"POST",status:200,durationMs:6200,at:sourceAt
  };
  const sender = {tab:{id:7,url:"https://chatgpt.com/"},url:"https://chatgpt.com/"};
  h.send({type:"openguin-network-event",event},sender);
  h.send({type:"openguin-network-event",event},sender);
  await new Promise(resolve => setTimeout(resolve,30));

  assert.equal(h.localState.events.length,1);
  assert.equal(h.localState.events[0].kind,"fetch-response");
  assert.equal(h.localState.events[0].sourceAt,sourceAt);
  assert.equal(typeof h.localState.events[0].bridgeDelayMs,"number");
  assert.equal(h.localState.duplicateEventsSuppressed,1);
});

test("background ignores events from a tab other than the active monitored tab", async () => {
  const h = makeHarness();
  h.send({
    type:"openguin-network-event",
    event:{kind:"fetch-response",host:"chatgpt.com",status:200,at:Date.now()}
  },{tab:{id:99,url:"https://chatgpt.com/"},url:"https://chatgpt.com/"});
  await new Promise(resolve => setTimeout(resolve,20));
  assert.equal(h.localState.events.length,0);
});
