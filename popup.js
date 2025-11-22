document.addEventListener("DOMContentLoaded", () => {
    const statusEl = document.getElementById("status");
    const toggleBtn = document.getElementById("toggleBtn");
    const manualBtn = document.getElementById("manualBtn");
    const resultEl = document.getElementById("result");
    const statusDetail = document.getElementById("status_detail");

    const blInput = document.getElementById("bl_input");
    const blAdd = document.getElementById("bl_add");
    const blList = document.getElementById("blacklist_list");

    /* -------------------------
       開關 UI
    ------------------------- */
    function updateUI(enabled) {
        statusEl.textContent = enabled ? "Enabled" : "Disabled";
        statusEl.style.color = enabled ? "green" : "red";
        toggleBtn.textContent = enabled ? "關閉功能" : "啟動功能";
    }

    chrome.storage.local.get({ enabled: true }, (items) => updateUI(items.enabled));

    toggleBtn.addEventListener("click", () => {
        chrome.storage.local.get({ enabled: true }, (items) => {
            const nv = !items.enabled;
            chrome.storage.local.set({ enabled: nv }, () => updateUI(nv));
        });
    });

    /* -------------------------
       顯示分析結果
    ------------------------- */
    function showLoading() {
        resultEl.innerHTML = `<i style="color:gray;">後端分析中...</i>`;
        statusDetail.textContent = "分析中…";
    }

    function loadResult() {
        chrome.storage.local.get("last_analysis_result", ({ last_analysis_result }) => {
            if (!last_analysis_result) {
                resultEl.textContent = "尚未有分析資料。";
                return;
            }

            const r = last_analysis_result;
            const elapsed = (r && r.elapsed_time != null) ? r.elapsed_time : "—";

            resultEl.innerHTML = `
                <b>偵測結果：</b> ${r.is_potential_phishing ? "釣魚網站" : "合法網站"}<br><br>
                <b>理由：</b><br>${r.explanation}<br><br>
                <b>耗時：</b> ${elapsed} 秒
            `;
        });
    }

    /* -------------------------
       Popup 初始化邏輯
       ★ 重要：先檢查是否正在分析
    ------------------------- */
    chrome.storage.local.get({ analysis_running: false }, ({ analysis_running }) => {
        if (analysis_running) {
            showLoading();
        } else {
            loadResult();
        }
    });

    /* -------------------------
       後端狀態推播
    ------------------------- */
    chrome.runtime.onMessage.addListener((msg) => {

        // ★ 開始分析
        if (msg.stage === "開始分析") {
            chrome.storage.local.set({ analysis_running: true });
            showLoading();
            return;
        }

        // 階段更新
        if (msg.stage) {
            statusDetail.textContent = msg.stage;
        }

        // ★ 分析完成
        if (msg.type === "analysis_result_done") {
            chrome.storage.local.set({ analysis_running: false });
            statusDetail.textContent = "";
            loadResult();
        }
    });

    /* -------------------------
       手動擷取
    ------------------------- */
    manualBtn.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: "manual_capture" });
        });
    });


    /* -------------------------
       黑名單：載入
    ------------------------- */
    function loadBlacklist() {
        fetch("http://127.0.0.1:5000/user_blacklist")
            .then(r => r.json())
            .then(data => {
                const list = data.list || [];

                if (list.length === 0) {
                    blList.innerHTML = "<i>目前沒有黑名單項目</i>";
                    return;
                }

                blList.innerHTML = "";

                list.forEach(url => {
                    const div = document.createElement("div");
                    div.className = "bl-item";

                    div.innerHTML = `
                        <span>${url}</span>
                        <span class="bl-del" data-url="${url}">❌</span>
                    `;

                    blList.appendChild(div);
                });

                document.querySelectorAll(".bl-del").forEach(btn => {
                    btn.addEventListener("click", () => {
                        const u = btn.getAttribute("data-url");
                        deleteBlacklist(u);
                    });
                });
            });
    }

    loadBlacklist();

    /* -------------------------
       黑名單：新增
    ------------------------- */
    blAdd.addEventListener("click", () => {
        const url = blInput.value.trim();
        if (!url) return alert("請輸入網址");

        fetch("http://127.0.0.1:5000/add_blacklist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
        })
            .then(r => r.json())
            .then(data => {
                alert(data.message);
                if (data.success) {
                    blInput.value = "";
                    loadBlacklist();
                }
            });
    });

    /* -------------------------
       黑名單：刪除
    ------------------------- */
    function deleteBlacklist(url) {
        fetch("http://127.0.0.1:5000/delete_blacklist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url })
        })
            .then(r => r.json())
            .then(data => {
                alert(data.message);
                if (data.success) loadBlacklist();
            });
    }

    /* -------------------------
       黑名單折疊
    ------------------------- */
    const blToggle = document.getElementById("bl_toggle");
    const blSection = document.getElementById("bl_section");

    blToggle.addEventListener("click", () => {
        if (blSection.style.display === "none") {
            blSection.style.display = "block";
            blToggle.textContent = "使用者黑名單 ▲";
        } else {
            blSection.style.display = "none";
            blToggle.textContent = "使用者黑名單 ▼";
        }
    });
    document.getElementById("bl_one_click").addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const url = tabs[0].url;
            chrome.runtime.sendMessage({ type: "add_current_to_blacklist", url });
        });
    });

});
