declare module "argon2" {
  export const argon2id: number;
  export function hash(
    password: string,
    options: {
      type: number;
      memoryCost: number;
      timeCost: number;
      parallelism: number;
    }
  ): Promise<string>;
  export function verify(hash: string, password: string): Promise<boolean>;
}
