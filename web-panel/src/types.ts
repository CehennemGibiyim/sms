export type ServiceInfo = {
  url: string
  method: 'GET' | 'POST'
  domain: string
  custom?: boolean
  headers?: Record<string, string>
  body?: string
}

export type ServiceMap = Record<string, ServiceInfo>

export type CustomService = {
  id: string
  name: string
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: string
  createdAt: number
}

export type ServiceStatus = 'idle' | 'running' | 'success' | 'fail'

export type LogEntry = {
  id: number
  service: string
  status: ServiceStatus
  message: string
  time: string
}

export type ProxyResult = {
  ok: boolean
  status: number
  body: string
  error?: string
}