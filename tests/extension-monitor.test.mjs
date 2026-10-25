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

function captureFetchBodyRead(bodyFailure = false) {
  const posted = [];
  const response = {
    status:200,
    body:null,
    json() {
      return bodyFailure
        ? Promise.reject(new SyntaxError("private response detail must not be captured"))
        : Promise.resolve({private:"body content must not be captured"});
    }
  };
  const fakeWindow = {
    fetch() { return Promise.resolve(response); },
    addEventListener() {},
    postMessage(message) { posted.push(message); }
  };
  class FakeXHR {
    open() {}
    send() {}
    addEventListener() {}
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
  return context.window.fetch("/backend-api/test")
    .then(result=>result.json())
    .then(()=>posted.map(item=>item.event).filter(Boolean),()=>posted.map(item=>item.event).filter(Boolean));
}

test("Fetch body JSON read emits timing metadata but never captures response content", async () => {
  const events = await captureFetchBodyRead(false);
  const start = events.find(event=>event.kind==="fetch-start");
  const response = events.find(event=>event.kind==="fetch-response");
  const body = events.find(event=>event.kind==="body-read-complete");
  assert(start && response && body);
  assert.equal(start.requestId,response.requestId);
  assert.equal(response.requestId,body.requestId);
  assert.equal(body.tag,"json");
  assert.equal(typeof body.bodyReadDurationMs,"number");
  assert.equal(typeof body.headersToBodyReadMs,"number");
  assert.equal(Object.hasOwn(body,"body"),false);
  assert.equal(Object.hasOwn(body,"response"),false);
});

test("Fetch body read errors are classified without recording error messages", async () => {
  const events = await captureFetchBodyRead(true);
  const body = events.find(event=>event.kind==="body-read-error");
  assert(body);
  assert.equal(body.errorType,"SyntaxError");
  assert.equal(Object.hasOwn(body,"message"),false);
  assert.equal(Object.hasOwn(body,"body"),false);
});

test("XHR timeout and abort are exported as distinct safe error categories", () => {
  const timeoutEvents = captureXhrFailure("timeout");
  const abortedEvents = captureXhrFailure("abort");
  const timeout = timeoutEvents.find(event=>event.kind==="xhr-error");
  const aborted = abortedEvents.find(event=>event.kind==="xhr-error");
  assert.equal(timeout.errorType,"TimeoutError");
  assert.equal(aborted.errorType,"AbortError");
  assert.equal(timeout.status,0);
  assert.equal(aborted.status,0);
  assert.match(timeout.requestId,/^r[a-z0-9]+-[a-z0-9]+$/i);
  assert.equal(timeout.requestId,timeoutEvents.find(event=>event.kind==="xhr-start").requestId);
  assert.equal(aborted.requestId,abortedEvents.find(event=>event.kind==="xhr-start").requestId);
});

test("XHR error event is classified as a network error without recording error text", () => {
  const event = captureXhrFailure("error").find(item=>item.kind==="xhr-error");
  assert.equal(event.errorType,"NetworkError");
  assert.equal(Object.hasOwn(event,"message"),false);
  assert.equal(Object.hasOwn(event,"body"),false);
});
