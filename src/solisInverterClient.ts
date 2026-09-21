import * as http from "http";
import { InverterDataFrame } from "./types/inverterDataFrame";

export default class SolisInverterClient {

  constructor(
    private address: string,
    private username: string,
    private password: string,
  ) {}

  async fetchData(): Promise<InverterDataFrame> {

    return new Promise((resolve, reject) => {

      const req = http.request(
        {
          hostname: this.address,
          port: 80,
          path: "/status.html",
          method: "GET",
          auth: `${this.username}:${this.password}`,
        },
        (res) => {

          if (!res.statusCode || res.statusCode !== 200) {
            reject(
              new Error(
                `Unexpected HTTP status ${res.statusCode}`,
              ),
            );
            return;
          }

          let body = "";

          res.on("data", (chunk) => {
            body += chunk.toString();
          });

          res.on("end", () => {

            const extract = (name: string): string => {

              const match = body.match(
                new RegExp(
                  `var\\s+${name}\\s*=\\s*"([^"]*)"`,
                ),
              );

              return match
                ? match[1].trim()
                : "";
            };

            resolve({

              lastSeen: Date.now(),

              inverter: {
                model: extract("webdata_pv_type"),
                serial: extract("webdata_sn"),
                firmwareMain: extract("webdata_msvn"),
                firmwareSlave: extract("webdata_ssvn"),
              },

              logger: {

                serial: extract("cover_mid"),
                version: extract("cover_ver"),
                mode: extract("cover_wmode"),

                ap: {
                  ssid: extract("cover_ap_ssid"),
                  ip: extract("cover_ap_ip"),
                  mac: extract("cover_ap_mac"),
                },

                sta: {
                  ssid: extract("cover_sta_ssid"),
                  ip: extract("cover_sta_ip"),
                  mac: extract("cover_sta_mac"),
                  rssi: extract("cover_sta_rssi"),
                },
              },

              remoteServer: {
                a: extract("status_a") === "1",
                b: extract("status_b") === "1",
              },

              power:
                parseInt(
                  extract("webdata_now_p"),
                  10,
                ) || 0,

              energy: {
                today:
                  parseFloat(
                    extract("webdata_today_e"),
                  ) || 0,

                total:
                  parseFloat(
                    extract("webdata_total_e"),
                  ) || 0,
              },
            });

          });
        },
      );

      req.on("error", reject);

      req.end();
    });
  }
}
