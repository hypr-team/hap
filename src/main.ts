import {
  Accessory,
  AccessoryEventTypes,
  Categories,
  Characteristic,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicValue,
  MDNSAdvertiser,
  NodeCallback,
  Service,
  uuid,
  VoidCallback,
} from ".";
import { Nullable } from "./types";
import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on("line", (line) => {
  try {
    const data = JSON.parse(line);
    console.log(data);
  } catch(e) {
    console.log("Can't parse stdin: " + line);
  }
});

const err: Nullable<Error> = null; // in case there were any problems

// here's a fake hardware device that we'll expose to HomeKit
const FAKE_OUTLET = {
  powerOn: false,
  setPowerOn: (on: CharacteristicValue) => {
    process.stdout.write(`${JSON.stringify({ id: 0, power: on })}\n`);
    console.log("Turning the outlet %s!...", on ? "on" : "off");
    if (on) {
      FAKE_OUTLET.powerOn = true;
      if (err) {
        return console.log(err);
      }
      console.log("...outlet is now on.");
    } else {
      FAKE_OUTLET.powerOn = false;
      if (err) {
        return console.log(err);
      }
      console.log("...outlet is now off.");
    }
  },
  identify: function () {
    console.log("Identify the outlet.");
  },
};

// Generate a consistent UUID for our outlet Accessory that will remain the same even when
// restarting our server. We use the `uuid.generate` helper function to create a deterministic
// UUID based on an arbitrary "namespace" and the accessory name.
const outletUUID = uuid.generate("hap-nodejs:accessories:Outlet");

// This is the Accessory that we'll return to HAP-NodeJS that represents our fake light.
const outlet = exports.accessory = new Accessory("Outlet", outletUUID);

// Add properties for publishing (in case we're using Core.js and not BridgedCore.js)
// @ts-expect-error: Core/BridgeCore API
outlet.username = "1A:2B:3C:4D:5D:FF";
// @ts-expect-error: Core/BridgeCore API
outlet.pincode = "031-45-154";
outlet.category = Categories.OUTLET;

// set some basic properties (these values are arbitrary and setting them is optional)
outlet
  .getService(Service.AccessoryInformation)!
  .setCharacteristic(Characteristic.Manufacturer, "Oltica")
  .setCharacteristic(Characteristic.Model, "Rev-1")
  .setCharacteristic(Characteristic.SerialNumber, "A1S2NASF88EW");

// listen for the "identify" event for this Accessory
outlet.on(AccessoryEventTypes.IDENTIFY, (paired: boolean, callback: VoidCallback) => {
  FAKE_OUTLET.identify();
  callback(); // success
});

// Add the actual outlet Service and listen for change events from iOS.
outlet
  .addService(Service.Outlet, "Fake Outlet") // services exposed to the user should have "names" like "Fake Light" for us
  .getCharacteristic(Characteristic.On)!
  .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
    FAKE_OUTLET.setPowerOn(value);
    callback(); // Our fake Outlet is synchronous - this value has been successfully set
  });

// We want to intercept requests for our current power state so we can query the hardware itself instead of
// allowing HAP-NodeJS to return the cached Characteristic.value.
outlet
  .getService(Service.Outlet)!
  .getCharacteristic(Characteristic.On)!
  .on(CharacteristicEventTypes.GET, (callback: NodeCallback<CharacteristicValue>) => {

    // this event is emitted when you ask Siri directly whether your light is on or not. you might query
    // the light hardware itself to find this out, then call the callback. But if you take longer than a
    // few seconds to respond, Siri will give up.

    const err = null; // in case there were any problems

    if (FAKE_OUTLET.powerOn) {
      console.log("Are we on? Yes.");
      callback(err, true);
    } else {
      console.log("Are we on? No.");
      callback(err, false);
    }
  });

outlet.publish({
  username: "1A:2B:3C:4D:5D:FF",
  pincode: "031-45-154",
  category: Categories.OUTLET,
  advertiser: MDNSAdvertiser.BONJOUR,
});

const signals = { "SIGINT": 2, "SIGTERM": 15 } as Record<string, number>;

Object.keys(signals).forEach(signal => {
  process.on(signal, async () => {
    await outlet.unpublish();
    setTimeout(() => {
      process.exit(128 + signals[signal]);
    }, 1000);
  });
});
