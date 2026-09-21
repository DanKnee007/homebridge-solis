import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  Formats,
  HAP,
  Logging,
  Perms,
  Service,
  Units,
} from "homebridge";

import SolisInverterClient from "./solisInverterClient";
import { InverterDataFrame } from "./types/inverterDataFrame";

let hap: HAP;

export = (api: API): void => {
  hap = api.hap;
  api.registerAccessory(
    "Solis PV Inverter Homebridge Plugin",
    SolisInverter,
  );
};

class SolisInverter implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly name: string;
  private readonly address: string;
  private readonly username: string;
  private readonly password: string;
  private readonly interval: number;
  private readonly solisInverterClient: SolisInverterClient;

  private on: boolean;
  private generating: boolean;

  private generatedToday: number;
  private totalGenerated: number;
  private currentlyGenerating: number;
  private wifiSignal: number;

  private inverterSerial: string;
  private inverterFirmware: string;

  private loggerSerial: string;
  private loggerVersion: string;

  private readonly inverterService: Service;
  private readonly informationService: Service;

  constructor(log: Logging, config: AccessoryConfig) {

    this.log = log;
    this.name = config.name;

    this.on = false;
    this.generating = false;

    this.generatedToday = 0;
    this.totalGenerated = 0;
    this.currentlyGenerating = 0;
    this.wifiSignal = 0;

    this.inverterSerial = "";
    this.inverterFirmware = "";

    this.loggerSerial = "";
    this.loggerVersion = "";

    this.interval =
      isNaN(parseInt(<string>config.interval))
      || parseInt(<string>config.interval) < 30
        ? 30
        : parseInt(<string>config.interval);

    this.address = <string>config.hostname;
    this.username = <string>config.username;
    this.password = <string>config.password;

    this.solisInverterClient = new SolisInverterClient(
      this.address,
      this.username,
      this.password,
    );

    this.fetchData();

    setInterval(
      this.fetchData.bind(this),
      this.interval * 1000,
    );

    this.inverterService =
      new hap.Service(this.name, hap.Service.Outlet.UUID);

    this.inverterService
      .addCharacteristic(hap.Characteristic.On)
      .on(
        CharacteristicEventTypes.GET,
        (callback: CharacteristicGetCallback) => {
          callback(undefined, this.on);
        },
      );

    this.inverterService
      .addCharacteristic(hap.Characteristic.OutletInUse)
      .on(
        CharacteristicEventTypes.GET,
        (callback: CharacteristicGetCallback) => {
          callback(undefined, this.generating);
        },
      );

    this.inverterService.addCharacteristic(
      new hap.Characteristic(
        "Current Generation",
        "E863F10D-079E-48FF-8F27-9C2605A29F52",
        {
          format: Formats.UINT16,
          unit: <Units>"Watts",
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        },
      ),
    )
    .on(
      CharacteristicEventTypes.GET,
      (callback: CharacteristicGetCallback) => {
        callback(undefined, this.currentlyGenerating);
      },
    );

    this.inverterService.addCharacteristic(
      new hap.Characteristic(
        "Today's Generation",
        "E863F10C-079E-48FF-8F27-9C2605A29F52",
        {
          format: Formats.FLOAT,
          unit: <Units>"kWh",
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        },
      ),
    )
    .on(
      CharacteristicEventTypes.GET,
      (callback: CharacteristicGetCallback) => {
        callback(undefined, this.generatedToday);
      },
    );

    this.inverterService.addCharacteristic(
      new hap.Characteristic(
        "Total Generation",
        "E863F10E-079E-48FF-8F27-9C2605A29F52",
        {
          format: Formats.FLOAT,
          unit: <Units>"kWh",
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        },
      ),
    )
    .on(
      CharacteristicEventTypes.GET,
      (callback: CharacteristicGetCallback) => {
        callback(undefined, this.totalGenerated);
      },
    );

    this.inverterService.addCharacteristic(
      new hap.Characteristic(
        "WiFi Signal",
        "E863F110-079E-48FF-8F27-9C2605A29F52",
        {
          format: Formats.UINT8,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        },
      ),
    )
    .on(
      CharacteristicEventTypes.GET,
      (callback: CharacteristicGetCallback) => {
        callback(undefined, this.wifiSignal);
      },
    );

    this.inverterService.addCharacteristic(
      new hap.Characteristic(
        "Inverter Serial",
        "E863F111-079E-48FF-8F27-9C2605A29F52",
        {
          format: Formats.STRING,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        },
      ),
    )
    .on(
      CharacteristicEventTypes.GET,
      (callback: CharacteristicGetCallback) => {
        callback(undefined, this.inverterSerial);
      },
    );

    this.inverterService.addCharacteristic(
      new hap.Characteristic(
        "Inverter Firmware",
        "E863F112-079E-48FF-8F27-9C2605A29F52",
        {
          format: Formats.STRING,
          perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        },
      ),
    )
    .on(
      CharacteristicEventTypes.GET,
      (callback: CharacteristicGetCallback) => {
        callback(undefined, this.inverterFirmware);
      },
    );

    this.informationService =
      new hap.Service.AccessoryInformation()
        .setCharacteristic(
          hap.Characteristic.Manufacturer,
          "Solis",
        )
        .setCharacteristic(
          hap.Characteristic.Model,
          "PV Inverter",
        )
        .setCharacteristic(
          hap.Characteristic.SerialNumber,
          "Unknown",
        )
        .setCharacteristic(
          hap.Characteristic.FirmwareRevision,
          "Unknown",
        );

    this.log.info(
      "Solis Inverter HomeKit interface finished initializing!",
    );
  }

  getServices(): Service[] {
    return [
      this.informationService,
      this.inverterService,
    ];
  }

  fetchData(): void {

    this.solisInverterClient
      .fetchData()
      .then((data: InverterDataFrame) => {

        this.log.debug(JSON.stringify(data));

        this.on = data.inverter.serial.length > 0;

        this.generatedToday = data.energy.today;
        this.totalGenerated = data.energy.total;

        this.currentlyGenerating = data.power;
        this.generating = data.power > 0;

        this.inverterSerial = data.inverter.serial;

        this.inverterFirmware =
          `${data.inverter.firmwareMain}/${data.inverter.firmwareSlave}`;

        this.loggerSerial = data.logger.serial;
        this.loggerVersion = data.logger.version;

        this.wifiSignal =
          parseInt(
            data.logger.sta.rssi.replace("%", ""),
          ) || 0;

        this.informationService
          .setCharacteristic(
            hap.Characteristic.SerialNumber,
            this.loggerSerial || "Unknown",
          )
          .setCharacteristic(
            hap.Characteristic.FirmwareRevision,
            this.loggerVersion || "Unknown",
          );

      })
      .catch((err: unknown) => {

        if (err instanceof Error) {
          this.log.warn(
            `Error communicating with inverter - ${err.message}`,
          );
        } else {
          this.log.warn(
            "Error communicating with inverter",
          );
        }

        this.on = false;
        this.generating = false;
        this.currentlyGenerating = 0;
        this.wifiSignal = 0;
      });
  }
}
