let button: HTMLButtonElement | null = null;

function removeButton() {
  button?.remove();
  button = null;
}

function showButton(selection: Selection) {
  const text = selection.toString().trim();
  if (!text || text.length > 300) {
    removeButton();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  button ??= createButton();
  button.textContent = "RepLoop 查词";
  button.style.left = `${Math.min(window.innerWidth - 120, rect.left)}px`;
  button.style.top = `${Math.min(window.innerHeight - 44, rect.bottom + 8)}px`;
  button.dataset.text = text;
}

function createButton() {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "reploop-selection-button";
  element.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const text = element.dataset.text ?? "";
    void chrome.runtime.sendMessage({
      type: "REPLOOP_OPEN_SELECTION",
      text
    });
    removeButton();
  });
  document.documentElement.appendChild(element);
  return element;
}

document.addEventListener("mouseup", () => {
  window.setTimeout(() => {
    const selection = window.getSelection();
    if (selection?.toString().trim()) {
      showButton(selection);
    } else {
      removeButton();
    }
  }, 20);
});

document.addEventListener("mousedown", (event) => {
  if ((event.target as HTMLElement)?.closest(".reploop-selection-button")) {
    return;
  }
  removeButton();
});

window.addEventListener("scroll", removeButton, { passive: true });
