import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { Action, ActionReply, Snapshot } from "../contracts.ts";
import type { LearningService } from "../application/service.ts";
export interface UIContext {
  snapshot: Snapshot;
  service: LearningService;
  busy: boolean;
  act: (action: Action) => Promise<ActionReply | undefined>;
  notify: (message: string) => void;
  open: (content: ReactNode, title: string) => void;
  close: () => void;
}
export const LearningContext = createContext<UIContext | null>(null);
export function useLearning(): UIContext {
  const value = useContext(LearningContext);
  if (!value) throw Error("学习应用尚未初始化");
  return value;
}
export const go = (path: string) => {
  window.location.hash = path;
};
export function Field({
  label,
  name,
  value = "",
  type = "text",
  required = true,
  maxLength = 3000,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="field">
      {label}
      {type === "textarea" ? (
        <textarea
          name={name}
          defaultValue={value}
          required={required}
          maxLength={maxLength}
        />
      ) : (
        <input
          name={name}
          defaultValue={value}
          type={type}
          required={required}
          maxLength={maxLength}
        />
      )}
    </label>
  );
}
export const value = (data: FormData, name: string) =>
  String(data.get(name) || "");
