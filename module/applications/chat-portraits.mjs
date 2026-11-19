// Create image or video element for portraits
function createPortraitElement(src, isVideo) {
  const element = isVideo
    ? document.createElement("video")
    : document.createElement("img");
  element.src = src;
  element.width = 36;
  element.height = 36;
  element.autoplay = false;
  element.controls = false;
  element.muted = true;
  element.classList.add("portrait");
  return element;
}

// Check if the file extension is webm
function isWebm(file) {
  return /(?:\.([^.]+))?$/.exec(file)?.[1] === "webm";
}

// Preprocess chat message before it is created
export function preprocessChatMessage(messageData, options, userId, diff) {
  // the speaking actor's picture (a deleted actor, e.g. a battle's enemy, falls back to the user's avatar)
  const actor = messageData.speaker?.actor ? game.actors.get(messageData.speaker.actor) : null;
  const portraitSource = actor?.img || game.user.avatar;

  messageData.updateSource({ flags: { portrait: { src: portraitSource } } });
}

// Render chat message
export function renderChatMessage(message, html, context) {
  // the system's own cards spoken by no actor («Шкода», «Лікування», «Коло дій», «Хімія», «Термінал Доглядача»…; author,
  // 2026-11-15): no picture and no sender name — the card's own header says what it is; the time, delete and «To:» stay
  // («To:» only on a card without dice: Foundry hides it on a whisper that carries rolls, the 3D dice cards of 2026-11-19)
  const sp = message.speaker ?? {};
  if (!sp.actor && !sp.token && String(message.content ?? "").includes("pust-chat")) {
    html.classList.add("pust-bare");
    return;
  }
  const { src: portraitSource } = message.flags?.["portrait"] || {};
  if (!portraitSource) return;

  const isVideo = isWebm(portraitSource);
  const portraitElement = createPortraitElement(portraitSource, isVideo);

  const headerElement = html.querySelectorAll(".message-header")?.[0];
  if (headerElement) {
    headerElement.prepend(portraitElement);
    headerElement.style.paddingBottom = "3px";
  }

  const senderElement = html.querySelectorAll(".message-sender")?.[0];
  if (senderElement) {
    senderElement.style.alignSelf = "center";
  }
}
