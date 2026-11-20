export function providerErrorMessage(status: number, raw: string): string {
  if (status === 403) {
    if (raw.startsWith("AI 模型服务")) return raw;
    try {
      const body = JSON.parse(raw);
      const error = body.error ?? body;
      if (error.code === "AccessDenied.Unpurchased" || error.type === "AccessDenied.Unpurchased") {
        return "AI 模型服务尚未开通当前模型的调用权限，已暂停生成；请由服务配置者在模型平台开通权限后再使用。";
      }
    } catch { /* Non-JSON denial remains terminal. */ }
    return "AI 模型服务拒绝访问，已暂停生成；请由服务配置者确认模型调用权限。";
  }
  return raw;
}

export function canRetryAI(status: number): boolean {
  return status === 429 || status >= 500;
}

export function aiFailureStatus(status?: number): number {
  return status && status >= 400 && status <= 599 ? status : 500;
}