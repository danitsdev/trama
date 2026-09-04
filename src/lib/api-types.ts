export type ApiRequest = {
  method?: string
  body?: unknown
  query: Record<string, string | string[] | undefined>
}

export type ApiResponse = {
  setHeader(name: string, value: string): void
  status(code: number): ApiResponse
  json(body: unknown): ApiResponse
}
