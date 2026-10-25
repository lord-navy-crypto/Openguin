import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source = readFileSync(new URL("../browser-extension/monitor-main.js", import.meta.url), "utf8");

function captureXhrFailure(failureEvent) {
  const posted = [];
  const windowListeners = {};
  const fakeWindow = {
    fetch() { return Promise.resolve({status:200,body:null}); },
    addEventListener(type, listener) {
      (windowListeners[type] ||= []).push(listener);
    },
    postMessage(message) { posted.push(message); }
  };
  class FakeXHR {
    constructor() { this.listeners = {}; this.status = 0; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    dispatch(type) { for (const listener of this.listeners[type] || []) listener({type,target:this}); }
    open() {}
    send() {
      if (failureEvent) this.dispatch(failureEvent);
      this.dispatch("loadend");
    }
  }
  const context = {
    window:fakeWindow,
    XMLHttpRequest:FakeXHR,
    location:{href:"https://chatgpt.com/",hostname:"chatgpt.com",pathname:"/"},
    document:{readyState:"complete",body:null},
    performance:{now:()=>100,getEntriesByType:()=>[]},
    PerformanceObserver:class { observe(){throw new Error("not supported in test");} disconnect(){} },
    URL,Date,Math,Number,String,Object,Promise,
    setTimeout:()=>1,clearTimeout:()=>{}
  };
  runInNewContext(source,context);
  const xhr = new FakeXHR();
  xhr.open("GET","/backend-api/test");
  xhr.send();
  return posted.map(item=>item.event).filter(Boolean);
}

test("XHR timeout and abort are exported as distinct safe error categories", () => {
  const timeout = captureXhrFailure("timeout").find(event=>event.kind==="xhr-error");
  const aborted = captureXhrFailure("abort").find(event=>event.kind==="xhr-error");
  assert.equal(timeout.errorType,"TimeoutError");
  assert.equal(aborted.errorType,"AbortError");
  assert.equal(timeout.status,0);
  assert.equal(aborted.status,0);
});

test("XHR error event is classified as a network error without recording error text", () => {
  const event = captureXhrFailure("error").find(item=>item.kind==="xhr-error");
  assert.equal(event.errorType,"NetworkError");
  assert.equal(Object.hasOwn(event,"message"),false);
  assert.equal(Object.hasOwn(event,"body"),false);
});
