type DecisionOption = { id: string; label: string; weight?: number; identifier?: string };
type DecisionFactor = { id: string; label: string; weight: number };
type DecisionScores = Record<string, Record<string, number>>;

function displayLabel(opt: { label: string; identifier?: string }): string {
  return opt.identifier ? `Option ${opt.identifier}: ${opt.label}` : opt.label;
}

type DecisionData = {
  options: DecisionOption[];
  factors: DecisionFactor[];
  scores: DecisionScores;
  waddScores: Record<string, number>;
  layoutName?: string | null;
  decisionTopic?: string;
};

type AttachParams = {
  host: HTMLElement;
  getDecisionData: () => DecisionData;
  showWaddOnButtons: boolean;
  onRestart?: () => void;
};

const STORAGE_KEY = "decision-layout-selection";

type StoredDecisionPayload = {
  optionId: string;
  option: string;
  optionIdentifier?: string;
  waddScore: number;
  relativeOptimality: { rank: number; total: number };
  layoutName?: string | null;
  decisionTopic?: string;
  dataset: {
    options: DecisionOption[];
    factors: DecisionFactor[];
    scores: DecisionScores;
    waddScores: Record<string, number>;
  };
};

type ModalAction = {
  label: string;
  variant?: "primary" | "secondary";
  onClick: () => void;
};

type ModalParams = {
  title?: string;
  body?: string;
  bodyNode?: HTMLElement;
  actions?: ModalAction[];
};

type ModalRef = {
  close: () => void;
  overlay: HTMLDivElement;
  dialog: HTMLDivElement;
};

function openModal({ title, body, bodyNode, actions = [] }: ModalParams): ModalRef {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const dialog = document.createElement("div");
  dialog.className = "modal";

  if (title) {
    const heading = document.createElement("h4");
    heading.textContent = title;
    dialog.appendChild(heading);
  }

  if (body) {
    const bodyEl = document.createElement("p");
    bodyEl.textContent = body;
    dialog.appendChild(bodyEl);
  }

  if (bodyNode) {
    dialog.appendChild(bodyNode);
  }

  if (actions.length) {
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "modal-actions";
    actions.forEach(action => {
      const btn = document.createElement("button");
      btn.className = `modal-btn${action.variant === "secondary" ? " modal-btn--secondary" : ""}`;
      btn.type = "button";
      btn.textContent = action.label;
      btn.addEventListener("click", action.onClick);
      actionsWrap.appendChild(btn);
    });
    dialog.appendChild(actionsWrap);
  }

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
  };

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  return { close, overlay, dialog };
}

function storeDecision(payload: StoredDecisionPayload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // no-op if storage not available
  }
}

export function attachDecisionWorkflow({ host, getDecisionData, showWaddOnButtons, onRestart }: AttachParams) {
  if (!host) return;

  const actionWrap = document.createElement("div");
  actionWrap.className = "decision-action";
  let decisionLocked = false;
  let activeOptionsClose: (() => void) | null = null;
  let peekButton: HTMLButtonElement | null = null;
  let minimizedModal: ModalRef | null = null;
  let currentSelectionModal: ModalRef | null = null;
  let optionGridRef: HTMLDivElement | null = null;

  function formatOptionLabel(label: string, waddScore?: number) {
    if (showWaddOnButtons && typeof waddScore === "number" && Number.isFinite(waddScore)) {
      return `${label} — WADD ${waddScore.toFixed(1)}/100`;
    }
    return label;
  }

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "decision-btn";
  trigger.textContent = "Ready to Make My Decision";

  trigger.addEventListener("click", () => {
    if (decisionLocked) return;
    const confirmModal = openModal({
      title: "Are you sure?",
      body: "Review your weights and scores before locking in a decision.",
      actions: [
        {
          label: "No, go back",
          variant: "secondary",
          onClick: () => confirmModal.close(),
        },
        {
          label: "Yes, continue",
          onClick: () => {
            confirmModal.close();
            openSelectionModal();
          },
        },
      ],
    });
  });

  actionWrap.appendChild(trigger);
  host.appendChild(actionWrap);

  function cleanupPeek() {
    if (peekButton) {
      peekButton.remove();
      peekButton = null;
    }
    minimizedModal = null;
  }

  function closeSelectionModal() {
    cleanupPeek();
    currentSelectionModal?.close();
    currentSelectionModal = null;
    activeOptionsClose = null;
    optionGridRef = null;
  }

  function showPeekButton() {
    if (peekButton) return;
    peekButton = document.createElement("button");
    peekButton.type = "button";
    peekButton.className = "modal-peek-button";
    peekButton.setAttribute("aria-label", "Return to decision dialog");
    peekButton.textContent = "^^";
    peekButton.addEventListener("click", () => {
      if (minimizedModal) {
        restoreSelectionModal();
      }
    });
    document.body.appendChild(peekButton);
  }

  function minimizeSelectionModal(modal: ModalRef) {
    if (minimizedModal) return;
    minimizedModal = modal;
    const { overlay, dialog } = modal;
    overlay.classList.add("modal-overlay--clear");
    dialog.classList.remove("modal--slide-in");
    void dialog.offsetWidth; // force reflow so slide-out animation plays smoothly
    dialog.classList.add("modal--slide-out");
    dialog.addEventListener("animationend", () => {
      dialog.classList.remove("modal--slide-out");
      if (minimizedModal !== modal) return;
      if (overlay.parentElement) {
        overlay.parentElement.removeChild(overlay);
      }
      showPeekButton();
    }, { once: true });
  }

  function restoreSelectionModal() {
    if (decisionLocked) return;
    const modal = minimizedModal;
    if (!modal) return;
    const { overlay, dialog } = modal;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      dialog.classList.add("modal--slide-in");
      dialog.addEventListener("animationend", () => {
        dialog.classList.remove("modal--slide-in");
      }, { once: true });
      overlay.classList.remove("modal-overlay--clear");
      if (optionGridRef) {
        refreshOptionButtons(optionGridRef);
      }
    });
    cleanupPeek();
    minimizedModal = null;
  }

  function refreshOptionButtons(container: HTMLElement) {
    const latest = getDecisionData();
    const labelLookup = new Map(latest.options.map(opt => [opt.id, displayLabel(opt)]));
    container.querySelectorAll<HTMLButtonElement>(".decision-option-button").forEach(btn => {
      const optionId = btn.dataset.optionId;
      if (!optionId) return;
      const label = labelLookup.get(optionId);
      if (!label) return;
      btn.textContent = formatOptionLabel(label, latest.waddScores[optionId]);
    });
  }

  function openSelectionModal() {
    if (decisionLocked) return;
    const decisionData = getDecisionData();
    const optionGrid = document.createElement("div");
    optionGrid.className = "decision-option-list";
    optionGridRef = optionGrid;

    decisionData.options.forEach(opt => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "decision-option-button";
      btn.dataset.optionId = opt.id;
      const wadd = decisionData.waddScores[opt.id];
      btn.textContent = formatOptionLabel(displayLabel(opt), wadd);
      btn.addEventListener("click", () => {
        const optionId = btn.dataset.optionId || opt.id;
        if (activeOptionsClose) {
          activeOptionsClose();
        }
        finalizeDecision(optionId);
      });
      optionGrid.appendChild(btn);
    });

    const selectionModal = openModal({
      title: "Choose an option",
      bodyNode: optionGrid,
      actions: [
        {
          label: "View layout",
          variant: "secondary",
          onClick: () => {
            if (!minimizedModal) {
              minimizeSelectionModal(selectionModal);
            }
          },
        },
        {
          label: "Cancel",
          variant: "secondary",
          onClick: () => {
            closeSelectionModal();
          },
        },
      ],
    });
    currentSelectionModal = selectionModal;
    activeOptionsClose = closeSelectionModal;
  }

  function finalizeDecision(optionId: string) {
    closeSelectionModal();
    decisionLocked = true;
    trigger.disabled = true;
    trigger.textContent = "Decision locked";
    const decisionData = getDecisionData();
    const waddScores = decisionData.waddScores;
    const sorted = [...decisionData.options]
      .sort((a, b) => (waddScores[b.id] ?? -Infinity) - (waddScores[a.id] ?? -Infinity));
    const total = sorted.length || 1;
    const position = Math.max(0, sorted.findIndex(o => o.id === optionId)) + 1;
    const chosen = decisionData.options.find(o => o.id === optionId);
    if (!chosen) return;
    const wadd = waddScores[optionId] ?? 0;
    storeDecision({
      optionId: chosen.id,
      option: chosen.label,
      optionIdentifier: chosen.identifier,
      waddScore: Number(wadd.toFixed(2)),
      relativeOptimality: { rank: position, total },
      layoutName: decisionData.layoutName ?? null,
      decisionTopic: decisionData.decisionTopic,
      dataset: {
        options: decisionData.options.map(opt => ({
          id: opt.id,
          label: opt.label,
          weight: opt.weight,
          identifier: opt.identifier,
        })),
        factors: (decisionData.factors ?? []).map(factor => ({
          id: factor.id,
          label: factor.label,
          weight: factor.weight,
        })),
        scores: decisionData.scores ?? {},
        waddScores,
      },
    });

    const resultModal = openModal({
      title: "Decision recorded",
      body: `Saved "${displayLabel(chosen)}" with a WADD score of ${wadd.toFixed(2)}. You can keep exploring the layout, but the decision is locked. To proceed, hit the "Next" button in the bottom right.`,
      actions: [
        {
          label: "Got it",
          onClick: () => resultModal.close(),
        },
      ],
    });
  }
}
