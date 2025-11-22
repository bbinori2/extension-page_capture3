// block.js
(() => {
    const params = new URLSearchParams(location.search);
    const target = params.get("target");

    const targetTextEl = document.getElementById("targetText");
    if (targetTextEl) {
        targetTextEl.textContent = target ? `目標網址：${target}` : "（無網址）";
    }

    document.getElementById("go")?.addEventListener("click", () => {
        if (!target) return;

        chrome.runtime.sendMessage({
            type: "open_original_site",
            target
        });
    });
})();
