declare module "@maxmind/geoip2-node" {
  export class Reader {
    static open(path: string): Promise<Reader>;
    city(ip: string): unknown;
  }
}
