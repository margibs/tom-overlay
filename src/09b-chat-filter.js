  // Hides "Nag-aalok ako ng ... sa Market!" messages from in-game chat.
  // React owns these nodes — use display:none via class, never remove.
  // Toggleable via localStorage key tom-hide-chat-offers (default: enabled).

  const CHAT_HIDE_KEY = "tom-hide-chat-offers";
  function isChatHideEnabled() {
    return localStorage.getItem(CHAT_HIDE_KEY) !== "0";
  }
  function setChatHideEnabled(on) {
    localStorage.setItem(CHAT_HIDE_KEY, on ? "1" : "0");
    applyChatFilterAll();
  }

  function isOfferRow(el) {
    if (!el || !el.textContent) return false;
    return CHAT_OFFER_REGEX.test(el.textContent);
  }

  function applyToRow(row) {
    if (!row || row.nodeType !== 1) return;
    const enabled = isChatHideEnabled();
    if (enabled && isOfferRow(row)) row.classList.add("tom-hidden-offer");
    else row.classList.remove("tom-hidden-offer");
  }

  function applyChatFilterAll() {
    document
      .querySelectorAll(".full-chat-message, .chat-widget-message")
      .forEach(applyToRow);
  }

  let chatObserver = null;
  function initChatFilter() {
    // Watch entire body for chat container mount + child message additions
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (
            node.matches &&
            (node.matches(".full-chat-message") ||
              node.matches(".chat-widget-message"))
          ) {
            applyToRow(node);
          }
          if (node.querySelectorAll) {
            node
              .querySelectorAll(".full-chat-message, .chat-widget-message")
              .forEach(applyToRow);
          }
        }
        if (
          m.type === "characterData" &&
          m.target.parentElement
        ) {
          const row = m.target.parentElement.closest(
            ".full-chat-message, .chat-widget-message",
          );
          if (row) applyToRow(row);
        }
      }
    });
    obs.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    chatObserver = obs;
    applyChatFilterAll();
  }
