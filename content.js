console.log("[EXT] content script loaded");

async function mainCapture() {

    // ========================================================
    // ⭐ 檢查是否需要跳過（使用者剛剛按下「仍要前往」）
    // ========================================================
    const currentURL = location.href;
    const { skip_once } = await chrome.storage.local.get("skip_once");

    if (skip_once && currentURL.includes(skip_once)) {
        console.log("[EXT] Skip analysis for:", currentURL);

        // 清空狀態，避免下次也跳過
        chrome.storage.local.set({ skip_once: null });

        return;  // ⭐ 不分析也不送後端
    }

    // ========================================================
    // ⭐ 正常分析流程
    // ========================================================

    chrome.storage.local.set({ analysis_running: true });
    chrome.runtime.sendMessage({ stage: "開始分析" });

    const start = performance.now();
    chrome.storage.local.set({ analysis_start_time: start });

    chrome.runtime.sendMessage({ stage: "資料擷取中…" });

    let html = "";
    try {
        const res = await fetch(location.href, { method: "GET", credentials: "same-origin" });
        html = await res.text();
    } catch {
        html = document.documentElement.innerHTML;
    }

    chrome.runtime.sendMessage({ stage: "分析資料整理中…" });

    const doc = new DOMParser().parseFromString(html, "text/html");

    const mainSelectors = ["article", "main", "#content", ".content", ".post", ".entry", ".article", ".main"];
    let mainArea = null;
    for (const sel of mainSelectors) {
        mainArea = doc.querySelector(sel);
        if (mainArea) break;
    }

    let contentText = mainArea ? mainArea.innerText : (doc.body?.innerText ?? "");
    contentText = contentText
        .replace(/\n\s*\n+/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

    const normalize = (u) => {
        try {
            const url = new URL(u, location.href);
            url.searchParams.delete("utm_source");
            url.searchParams.delete("utm_medium");
            url.searchParams.delete("utm_campaign");
            url.hash = "";
            return url.toString();
        } catch {
            return u;
        }
    };

    const links = [...doc.querySelectorAll("a[href]")]
        .map(a => a.getAttribute("href"))
        .filter(h => h && !h.startsWith("javascript:") && !h.startsWith("mailto:") && !h.startsWith("#"))
        .map(normalize);

    const output = [
        `=== URL ===\n${location.href}`,
        `=== Timestamp ===\n${Date.now()}`,
        `=== Page Title ===\n${(doc.title || "").trim()}`,
        `=== Visible Text (main excerpt) ===\n${contentText.slice(0, 20000)}`,
        `=== Links ===\n${links.join("\n")}`
    ].join("\n\n");

    chrome.runtime.sendMessage({
        type: "analyze_request",
        text: output,
        startTime: start
    });
}

chrome.storage.local.get({ enabled: true }, (items) => {
    if (items.enabled) mainCapture();
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "manual_capture") mainCapture();
});
