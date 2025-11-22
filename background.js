function safeSendMessage(payload) {
    chrome.runtime.sendMessage(payload, () => {
        void chrome.runtime.lastError; // 吃掉錯誤避免噴 log
    });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    // ========================================================
    // ① block 頁面點「仍要前往」 → 回到原網址
    // ========================================================
    if (msg.type === "open_original_site" && msg.target) {

        // ⭐ 標記下一次導向跳過黑名單攔截
        chrome.storage.local.set({ skip_once: msg.target }, () => {

            if (sender?.tab?.id) {
                chrome.tabs.update(sender.tab.id, { url: msg.target });
            } else {
                chrome.tabs.create({ url: msg.target });
            }

        });

        return true;
    }

    // ========================================================
    // ② popup 一鍵加入黑名單
    // ========================================================
    if (msg.type === "add_current_to_blacklist") {

        chrome.storage.local.get({ user_blacklist: [] }, (data) => {

            const url = msg.url;
            const list = new Set(data.user_blacklist || []);
            list.add(url);

            chrome.storage.local.set({ user_blacklist: Array.from(list) }, () => {
                console.log("[BL] 加入使用者黑名單：", url);
                safeSendMessage({ bl_updated: true });
            });
        });

        return;
    }

    // ========================================================
    // ③ content.js 要求分析 → 後端深度分析
    // ========================================================
    if (msg.type === "analyze_request") {

        const text = msg.text || "";
        safeSendMessage({ stage: "已送出後端…" });

        fetch("http://127.0.0.1:5000/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        })
            .then(resp => {
                safeSendMessage({ stage: "模型判斷中…" });
                return resp.json();
            })
            .then(data => {

                // 儲存結果
                chrome.storage.local.set({ last_analysis_result: data }, () => {
                    safeSendMessage({ type: "analysis_result_done" });
                });

                // ========================================================
                // ⭐ 黑名單命中 → 分成 official（紅） / user（黃）
                // ========================================================
                if (data.is_blacklisted === true) {

                    const src = data.blacklist_source; // ← ★ 正確欄位

                    const html = (src === "official")
                        ? "block_official.html"
                        : "block_user.html";

                    const originalUrl = sender?.tab?.url || msg.url;

                    chrome.tabs.update(sender.tab.id, {
                        url: chrome.runtime.getURL(
                            `${html}?target=${encodeURIComponent(originalUrl)}`
                        )
                    });
                }

                sendResponse && sendResponse({ ok: true });
            })
            .catch(err => {
                safeSendMessage({ stage: "後端錯誤" });
                sendResponse && sendResponse({ ok: false, error: String(err) });
            });

        return true;
    }

});
