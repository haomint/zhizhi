import { Capacitor, registerPlugin } from "@capacitor/core";
import { list, record, requireThat } from "../contracts.ts";
import type { Material, ModelPayload } from "../contracts.ts";
import { material, uid } from "../core/domain.ts";
export interface Platform {
  native: boolean;
  status(): Promise<{ configured: boolean }>;
  configure(key: string): Promise<void>;
  clearKey(): Promise<void>;
  complete(payload: ModelPayload, signal?: AbortSignal): Promise<unknown>;
  test(model: string): Promise<void>;
  search(query: string): Promise<Material[]>;
  loadRule(name: string): Promise<string>;
  loadDemo(): Promise<unknown>;
  exportArchive(text: string): Promise<void>;
}
interface PersonalPlugin {
  status(): Promise<{ configured: boolean }>;
  configure(input: { key: string }): Promise<void>;
  clearKey(): Promise<void>;
  complete(input: {
    requestId: string;
    payload: ModelPayload;
  }): Promise<unknown>;
  cancel(input: { requestId: string }): Promise<void>;
  generate(input: {
    model: string;
    system: string;
    topic: string;
  }): Promise<unknown>;
  searchMaterials(input: { query: string; pageid?: number }): Promise<unknown>;
  exportBackup(input: { text: string }): Promise<void>;
}
const TAIL_SECTIONS =
  /\n==+\s*(?:参考文献|参考资料|参考来源|外部链接|外部連結|注释|註釋|延伸阅读|参见|參見)\s*==+[\s\S]*$/;
export function parseSearch(raw: unknown, full = false): Material[] {
  const response = record(raw);
  requireThat(!response.error, "百科服务暂不可用，请导入文字材料");
  const query = response.query ? record(response.query) : {};
  const pages = query.pages ? Object.values(record(query.pages)) : [];
  return pages
    .map(record)
    .filter((p) => typeof p.extract === "string" && typeof p.title === "string")
    .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0))
    .slice(0, 3)
    .map((p) =>
      material({
        title: String(p.title),
        text: String(p.extract).replace(TAIL_SECTIONS, "").slice(0, 24000),
        url: "https://zh.wikipedia.org/?curid=" + String(p.pageid),
        location:
          (full ? "条目全文" : "条目导言") + "；pageid=" + String(p.pageid),
        kind: "wikipedia",
        license: "Wikipedia 贡献者，CC BY-SA；仅供学习参考",
      }),
    );
}
export function createPlatform(): Platform {
  const native = Capacitor.isNativePlatform(),
    plugin = registerPlugin<PersonalPlugin>("Personal");
  const textResource = async (path: string) => {
    const response = await fetch("./" + path);
    requireThat(response.ok, "应用资源读取失败：" + path);
    return response.text();
  };
  const noModel = () => {
    throw Error("浏览器预览仅支持本地功能；请在安卓应用中设置模型 Key。");
  };
  return {
    native,
    status: () =>
      native ? plugin.status() : Promise.resolve({ configured: false }),
    configure: async (key) => {
      if (!native) noModel();
      await plugin.configure({ key });
    },
    clearKey: async () => {
      if (native) await plugin.clearKey();
    },
    complete: async (payload, signal) => {
      if (!native) return noModel();
      const requestId = uid();
      const cancel = () => {
        void plugin.cancel({ requestId }).catch(() => {});
      };
      if (signal?.aborted) throw Error("已取消");
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        return await plugin.complete({ requestId, payload });
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
    },
    test: async (model) => {
      if (!native) noModel();
      await plugin.generate({ model, system: "只回复OK", topic: "连接测试" });
    },
    search: async (query) => {
      const wiki = async (params: Record<string, string>) => {
        const url = new URL("https://zh.wikipedia.org/w/api.php");
        url.search = new URLSearchParams({
          action: "query",
          prop: "extracts",
          explaintext: "1",
          variant: "zh-cn",
          format: "json",
          utf8: "1",
          origin: "*",
          ...params,
        }).toString();
        const response = await fetch(url, {
          signal: AbortSignal.timeout(20000),
        });
        requireThat(response.ok, "百科检索失败，请导入文字材料");
        return response.json() as Promise<unknown>;
      };
      const results = parseSearch(
        native
          ? await plugin.searchMaterials({ query })
          : await wiki({
              generator: "search",
              gsrsearch: query,
              gsrnamespace: "0",
              gsrlimit: "3",
              exintro: "1",
            }),
      );
      // 导言通常只有几百字，为排名第一的条目补取全文；失败时保留导言。
      const pageid = Number(results[0]?.url.split("curid=")[1]);
      if (pageid)
        try {
          const [full] = parseSearch(
            native
              ? await plugin.searchMaterials({ query, pageid })
              : await wiki({ pageids: String(pageid) }),
            true,
          );
          if (full && full.text.length > results[0].text.length)
            results[0] = { ...full, id: results[0].id };
        } catch {
          // 保留导言
        }
      return results;
    },
    loadRule: (name) => textResource("skills/" + name + ".md"),
    loadDemo: async () =>
      JSON.parse(await textResource("demo.json")) as unknown,
    exportArchive: async (text) => {
      if (native) {
        await plugin.exportBackup({ text });
        return;
      }
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download =
        "知枝-学习档案-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}
