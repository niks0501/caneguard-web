import type { AxiosInstance } from "axios";
import { z } from "zod";
import { axiosClient } from "../../api/axiosClient";
import type { FieldReporter } from "../../domain/fieldValidation.types";
import type { FieldReportersRepository } from "../contracts/FieldReportersRepository";

const responseSchema = z.object({
  data: z.array(z.object({ uuid: z.string(), name: z.string() })),
});

export class ApiFieldReportersRepository implements FieldReportersRepository {
  private readonly client: AxiosInstance;

  constructor(client: AxiosInstance = axiosClient) {
    this.client = client;
  }

  async list(): Promise<FieldReporter[]> {
    const response = await this.client.get("/api/v1/field-reporters");
    return responseSchema.parse(response.data).data;
  }
}
