import { useEffect, useState } from "react";
import { showToast } from "./components/ui-lib";
import Locale from "./locales";
import { RequestMessage } from "./client/api";
import { ServiceProvider, REQUEST_TIMEOUT_MS } from "./constant";
import isObject from "lodash-es/isObject";
import { fetch as tauriFetch, Body, ResponseType } from "@tauri-apps/api/http";

export function trimTopic(topic: string) {
  // Fix an issue where double quotes still show in the Indonesian language
  // This will remove the specified punctuation from the end of the string
  // and also trim quotes from both the start and end if they exist.
  return (
    topic
      // fix for gemini
      .replace(/^["“”*]+|["“”*]+$/g, "")
      .replace(/[，。！？”“"、,.!?*]*$/, "")
  );
}

export async function copyToClipboard(text: string) {
  try {
    if (window.__TAURI__) {
      window.__TAURI__.writeText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }

    showToast(Locale.Copy.Success);
  } catch (error) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      showToast(Locale.Copy.Success);
    } catch (error) {
      showToast(Locale.Copy.Failed);
    }
    document.body.removeChild(textArea);
  }
}

export async function downloadAs(text: string, filename: string) {
  if (window.__TAURI__) {
    const result = await window.__TAURI__.dialog.save({
      defaultPath: `${filename}`,
      filters: [
        {
          name: `${filename.split(".").pop()} files`,
          extensions: [`${filename.split(".").pop()}`],
        },
        {
          name: "All Files",
          extensions: ["*"],
        },
      ],
    });

    if (result !== null) {
      try {
        await window.__TAURI__.fs.writeTextFile(result, text);
        showToast(Locale.Download.Success);
      } catch (error) {
        showToast(Locale.Download.Failed);
      }
    } else {
      showToast(Locale.Download.Failed);
    }
  } else {
    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/plain;charset=utf-8," + encodeURIComponent(text),
    );
    element.setAttribute("download", filename);

    element.style.display = "none";
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }
}

export function readFromFile() {
  return new Promise<string>((res, rej) => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json";

    fileInput.onchange = (event: any) => {
      const file = event.target.files[0];
      const fileReader = new FileReader();
      fileReader.onload = (e: any) => {
        res(e.target.result);
      };
      fileReader.onerror = (e) => rej(e);
      fileReader.readAsText(file);
    };

    fileInput.click();
  });
}

export function isIOS() {
  const userAgent = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
}

export function useWindowSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const onResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return size;
}

export const MOBILE_MAX_WIDTH = 600;
export function useMobileScreen() {
  const { width } = useWindowSize();

  return width <= MOBILE_MAX_WIDTH;
}

export function isFirefox() {
  return (
    typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent)
  );
}

export function selectOrCopy(el: HTMLElement, content: string) {
  const currentSelection = window.getSelection();

  if (currentSelection?.type === "Range") {
    return false;
  }

  copyToClipboard(content);

  return true;
}

function getDomContentWidth(dom: HTMLElement) {
  const style = window.getComputedStyle(dom);
  const paddingWidth =
    parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const width = dom.clientWidth - paddingWidth;
  return width;
}

function getOrCreateMeasureDom(id: string, init?: (dom: HTMLElement) => void) {
  let dom = document.getElementById(id);

  if (!dom) {
    dom = document.createElement("span");
    dom.style.position = "absolute";
    dom.style.wordBreak = "break-word";
    dom.style.fontSize = "14px";
    dom.style.transform = "translateY(-200vh)";
    dom.style.pointerEvents = "none";
    dom.style.opacity = "0";
    dom.id = id;
    document.body.appendChild(dom);
    init?.(dom);
  }

  return dom!;
}

export function autoGrowTextArea(dom: HTMLTextAreaElement) {
  const measureDom = getOrCreateMeasureDom("__measure");
  const singleLineDom = getOrCreateMeasureDom("__single_measure", (dom) => {
    dom.innerText = "TEXT_FOR_MEASURE";
  });

  const width = getDomContentWidth(dom);
  measureDom.style.width = width + "px";
  measureDom.innerText = dom.value !== "" ? dom.value : "1";
  measureDom.style.fontSize = dom.style.fontSize;
  measureDom.style.fontFamily = dom.style.fontFamily;
  const endWithEmptyLine = dom.value.endsWith("\n");
  const height = parseFloat(window.getComputedStyle(measureDom).height);
  const singleLineHeight = parseFloat(
    window.getComputedStyle(singleLineDom).height,
  );

  const rows =
    Math.round(height / singleLineHeight) + (endWithEmptyLine ? 1 : 0);

  return rows;
}

export function getCSSVar(varName: string) {
  return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

/**
 * Detects Macintosh
 */
export function isMacOS(): boolean {
  if (typeof window !== "undefined") {
    let userAgent = window.navigator.userAgent.toLocaleLowerCase();
    const macintosh = /iphone|ipad|ipod|macintosh/.test(userAgent);
    return !!macintosh;
  }
  return false;
}

export function getMessageTextContent(message: RequestMessage) {
  if (typeof message.content === "string") {
    return message.content;
  }
  for (const c of message.content) {
    if (c.type === "text") {
      return c.text ?? "";
    }
  }
  return "";
}

export function getMessageImages(message: RequestMessage): string[] {
  if (typeof message.content === "string") {
    return [];
  }
  const urls: string[] = [];
  for (const c of message.content) {
    if (c.type === "image_url") {
      urls.push(c.image_url?.url ?? "");
    }
  }
  return urls;
}

export function isVisionModel(model: string) {
  // Note: This is a better way using the TypeScript feature instead of `&&` or `||` (ts v5.5.0-dev.20240314 I've been using)

  const visionKeywords = [
    "vision",
    "claude-3",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gpt-4o",
    "gpt-4o-mini",
  ];
  const isGpt4Turbo =
    model.includes("gpt-4-turbo") && !model.includes("preview");

  return (
    visionKeywords.some((keyword) => model.includes(keyword)) || isGpt4Turbo
  );
}

export function isDalle3(model: string) {
  return "dall-e-3" === model;
}

export function showPlugins(provider: ServiceProvider, model: string) {
  if (
    provider == ServiceProvider.OpenAI ||
    provider == ServiceProvider.Azure ||
    provider == ServiceProvider.Moonshot
  ) {
    return true;
  }
  if (provider == ServiceProvider.Anthropic && !model.includes("claude-2")) {
    return true;
  }
  return false;
}

export function fetch(
  url: string,
  options?: Record<string, unknown>,
): Promise<any> {
  if (window.__TAURI__) {
    const payload = options?.body || options?.data;
    return tauriFetch(url, {
      ...options,
      body:
        payload &&
        ({
          type: "Text",
          payload,
        } as any),
      timeout: ((options?.timeout as number) || REQUEST_TIMEOUT_MS) / 1000,
      responseType:
        options?.responseType == "text" ? ResponseType.Text : ResponseType.JSON,
    } as any);
  }
  return window.fetch(url, options);
}

export function adapter(config: Record<string, unknown>) {
  const { baseURL, url, params, ...rest } = config;
  const path = baseURL ? `${baseURL}${url}` : url;
  const fetchUrl = params
    ? `${path}?${new URLSearchParams(params as any).toString()}`
    : path;
  return fetch(fetchUrl as string, { ...rest, responseType: "text" });
}

export function safeLocalStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
} {
  let storage: Storage | null;

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      storage = window.localStorage;
    } else {
      storage = null;
    }
  } catch (e) {
    console.error("localStorage is not available:", e);
    storage = null;
  }

  return {
    getItem(key: string): string | null {
      if (storage) {
        return storage.getItem(key);
      } else {
        console.warn(
          `Attempted to get item "${key}" from localStorage, but localStorage is not available.`,
        );
        return null;
      }
    },
    setItem(key: string, value: string): void {
      if (storage) {
        storage.setItem(key, value);
      } else {
        console.warn(
          `Attempted to set item "${key}" in localStorage, but localStorage is not available.`,
        );
      }
    },
    removeItem(key: string): void {
      if (storage) {
        storage.removeItem(key);
      } else {
        console.warn(
          `Attempted to remove item "${key}" from localStorage, but localStorage is not available.`,
        );
      }
    },
    clear(): void {
      if (storage) {
        storage.clear();
      } else {
        console.warn(
          "Attempted to clear localStorage, but localStorage is not available.",
        );
      }
    },
  };
}
