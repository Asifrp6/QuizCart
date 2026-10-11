(() => {
  // Loaded by the lightweight block entry after the quiz block is rendered.
  const ENDPOINT = "/apps/quizcart";
  const boot = (source = document) => {
    const scope =
      source instanceof Element
        ? source
        : source instanceof Event && source.target instanceof Element
          ? source.target
          : document;
    if (scope instanceof Element && scope.matches(".quizcart-root")) {
      mountOnce(scope);
    }
    scope.querySelectorAll(".quizcart-root").forEach(mountOnce);
  };

  const mountOnce = (root) => {
    if (!(root instanceof HTMLElement) || root.dataset.ready === "true") return;
    root.dataset.ready = "true";
    mount(root);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  document.addEventListener("shopify:section:load", boot);
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) boot(node);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  async function mount(root) {
    const handle = root.dataset.handle || "";
    const heading = root.dataset.heading || "";

    try {
      const query = handle ? `?handle=${encodeURIComponent(handle)}` : "";
      const data = await request(`/quiz${query}`);
      await request("/event", {
        method: "POST",
        body: { handle: data.quiz.handle, eventType: "quiz_viewed" },
      }).catch(() => {});
      renderQuiz(root, data.quiz, heading);
    } catch (error) {
      renderMessage(
        root,
        heading,
        error.message || "This quiz is unavailable.",
      );
    }
  }

  function renderQuiz(root, quiz, heading) {
    root.quizcartTheme = quiz.appearance;
    applyTheme(root, quiz.appearance);
    showWelcome(root, {
      quiz,
      heading,
      sessionId: "",
      responses: [],
      index: 0,
    });
  }

  function showWelcome(root, state) {
    const { quiz } = state;
    const card = cardShell(root, true, 0);
    addText(card, "h2", "", quiz.welcomeTitle || "Find your perfect product");
    addText(card, "p", "quizcart-help", quiz.welcomeBody);
    if (quiz.welcomeImageUrl) {
      const image = element(card, "img", "quizcart-welcome-image");
      image.src = quiz.welcomeImageUrl;
      image.alt = "";
      image.loading = "lazy";
    }
    const actions = element(card, "div", "quizcart-actions");
    button(
      actions,
      `${quiz.startButtonText || "Start Quiz"} →`,
      async (control) => {
        control.disabled = true;
        await begin(root, state);
      },
    );
    if (quiz.showDuration || quiz.showPersonalizedBenefit) {
      const points = element(card, "ul", "quizcart-points");
      if (quiz.showDuration)
        addText(
          points,
          "li",
          "",
          `Takes about ${quiz.durationText || "2 minutes"}`,
        );
      if (quiz.showPersonalizedBenefit) {
        (quiz.welcomeBenefits || ["100% personalized results"]).forEach(
          (benefit) => {
            if (
              quiz.showDuration &&
              /^takes less than 2 minutes$/i.test(String(benefit).trim())
            ) {
              return;
            }
            addText(points, "li", "", benefit);
          },
        );
      }
    }
  }

  async function begin(root, state) {
    const { quiz } = state;
    const fields = state.quiz.customer;
    if (!fields.collectName && !fields.collectAge) {
      await createSession(root, state, "", null);
      return;
    }

    const card = cardShell(root, false, 1);
    stepRow(
      card,
      1,
      state.quiz.questions.length + Number(collectsInfo(state)) + 1,
      () => showWelcome(root, state),
    );
    addText(card, "h2", "", quiz.customerInfoTitle || "Let's get to know you");
    addText(
      card,
      "p",
      "quizcart-help",
      quiz.customerInfoBody ||
        "This helps us find the best match for your needs.",
    );
    const form = element(card, "form", "");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const ageRange = String(data.get("ageRange") || "");
      if (fields.collectName && fields.nameRequired && !name) {
        showError(card, "Enter your name to continue.");
        return;
      }
      if (fields.collectAge && fields.ageRequired && !ageRange) {
        showError(card, "Choose your age range to continue.");
        return;
      }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      createSession(root, state, name, ageRange).finally(() => {
        submit.disabled = false;
      });
    });
    if (fields.collectName)
      field(form, "Your Name", "text", "name", "Enter your name");
    if (fields.collectAge) ageRangeField(form, state.quiz.ageRangeOptions);
    const actions = element(form, "div", "quizcart-actions");
    const submit = button(actions, "Next →");
    submit.type = "submit";
  }

  async function createSession(root, state, name, ageRange) {
    try {
      const data = await request("/session", {
        method: "POST",
        body: { handle: state.quiz.handle, name, ageRange },
      });
      state.sessionId = data.sessionId;
      state.responses = [];
      state.index = 0;
      showQuestion(root, state);
    } catch (error) {
      renderMessage(root, state.heading, error.message);
    }
  }

  function showQuestion(root, state) {
    const visible = visibleQuestions(state.quiz, state.responses);
    const question = visible[state.index];
    if (!question) {
      finish(root, state);
      return;
    }
    request("/event", {
      method: "POST",
      body: {
        sessionId: state.sessionId,
        eventType: "question_viewed",
        metadata: { questionId: question.id, prompt: question.prompt },
      },
    }).catch(() => {});

    const card = cardShell(root, false);
    {
      stepRow(
        card,
        state.index + 1 + Number(collectsInfo(state)),
        visible.length + Number(collectsInfo(state)) + 1,
        () => {
          if (state.index > 0) {
            state.index -= 1;
            showQuestion(root, state);
          } else if (collectsInfo(state)) {
            begin(root, state);
          } else {
            showWelcome(root, state);
          }
        },
      );
    }
    addText(card, "h2", "", question.prompt);
    if (question.helpText)
      addText(card, "p", "quizcart-help", question.helpText);

    const existing = state.responses.find(
      (item) => item.questionId === question.id,
    );
    const selected = new Set(existing?.answerIds || []);
    let numeric = existing?.numericValue ?? question.sliderMin;
    let textValue = existing?.textValue || "";

    if (question.type === "dropdown") {
      const select = element(card, "select", "quizcart-field");
      const placeholder = element(select, "option", "");
      placeholder.value = "";
      placeholder.textContent = "Choose one";
      question.answers.forEach((answer) => {
        const option = element(select, "option", "");
        option.value = answer.id;
        option.textContent = answer.label;
        if (selected.has(answer.id)) option.selected = true;
      });
      select.addEventListener("change", () => {
        selected.clear();
        if (select.value) selected.add(select.value);
      });
    } else if (question.type === "slider") {
      const input = element(card, "input", "quizcart-range");
      input.type = "range";
      input.min = String(question.sliderMin);
      input.max = String(question.sliderMax);
      input.step = String(question.sliderStep);
      input.value = String(numeric);
      const label = addText(card, "p", "quizcart-help", String(numeric));
      input.addEventListener("input", () => {
        numeric = Number(input.value);
        label.textContent = input.value;
      });
    } else if (question.type === "text") {
      const input = element(card, "textarea", "quizcart-field");
      input.rows = 4;
      input.value = textValue;
      input.placeholder = "Type your answer";
      input.addEventListener("input", () => {
        textValue = input.value;
      });
    } else {
      const grid =
        question.layout === "list" ||
        (question.layout !== "grid" && question.type === "multiple")
          ? "quizcart-options is-list"
          : "quizcart-options is-grid";
      const options = element(card, "div", grid);
      question.answers.forEach((answer) => {
        const option = element(options, "button", "quizcart-option");
        option.type = "button";
        const mark = element(option, "span", "quizcart-check");
        mark.textContent = "✓";
        if (answer.imageUrl.startsWith("https://")) {
          const image = element(option, "img", "");
          image.src = answer.imageUrl;
          image.alt = "";
        } else if (question.type !== "multiple") {
          addText(
            option,
            "span",
            "quizcart-mark",
            answer.label.slice(0, 1).toUpperCase(),
          );
        }
        addText(option, "strong", "", answer.label);
        if (answer.description) {
          addText(
            option,
            "small",
            "quizcart-option-description",
            answer.description,
          );
        }
        const paint = () => {
          option.classList.toggle("is-selected", selected.has(answer.id));
        };
        paint();
        option.addEventListener("click", () => {
          if (question.type === "multiple") {
            if (selected.has(answer.id)) selected.delete(answer.id);
            else selected.add(answer.id);
          } else {
            selected.clear();
            selected.add(answer.id);
            options.querySelectorAll(".quizcart-option").forEach((node) => {
              node.classList.remove("is-selected");
            });
          }
          paint();
        });
      });
    }

    const actions = element(card, "div", "quizcart-actions");
    const last = state.index >= visible.length - 1;
    button(
      actions,
      last ? "Get My Recommendations →" : "Next →",
      async (control) => {
        if (
          question.required &&
          question.type !== "slider" &&
          question.type !== "text" &&
          selected.size === 0
        ) {
          showError(card, "Choose an answer to continue.");
          return;
        }
        if (
          question.type === "text" &&
          question.required &&
          !textValue.trim()
        ) {
          showError(card, "Enter an answer to continue.");
          return;
        }
        const response = {
          questionId: question.id,
          answerIds: [...selected],
          textValue: question.type === "text" ? textValue.trim() : "",
          numericValue: question.type === "slider" ? numeric : null,
        };
        try {
          control.disabled = true;
          await request("/answer", {
            method: "POST",
            body: { sessionId: state.sessionId, ...response },
          });
        } catch (error) {
          control.disabled = false;
          showError(card, error.message);
          return;
        }
        state.responses = state.responses.filter(
          (item) => item.questionId !== question.id,
        );
        state.responses.push(response);
        const nextVisible = visibleQuestions(state.quiz, state.responses);
        const position = nextVisible.findIndex(
          (item) => item.id === question.id,
        );
        state.index = position + 1;
        if (state.index >= nextVisible.length) finish(root, state);
        else showQuestion(root, state);
      },
    );
  }

  async function finish(root, state) {
    const card = cardShell(root, state.heading);
    addText(card, "h2", "", "Analyzing your answers...");
    addText(
      card,
      "p",
      "quizcart-help",
      "We're finding products that match your preferences.",
    );
    try {
      const data = await request("/complete", {
        method: "POST",
        body: { sessionId: state.sessionId },
      });
      showResults(root, state, data);
    } catch (error) {
      renderMessage(root, state.heading, error.message);
    }
  }

  function showResults(root, state, data) {
    const card = cardShell(root, true);
    addText(
      card,
      "h2",
      "",
      data.resultTitle ||
        state.quiz.resultTitle ||
        "Your Personalized Recommendations",
    );
    addText(
      card,
      "p",
      "quizcart-help",
      data.resultBody || state.quiz.resultBody,
    );
    const products = data.recommendations || [];
    if (!products.length) {
      addText(card, "p", "", "We couldn't find a matching product yet.");
    } else {
      const lead = products.slice(0, 3);
      const more = products.slice(3);
      paintProducts(card, state, lead, true);
      if (more.length) {
        addText(card, "h2", "quizcart-also", "You might also like");
        addText(
          card,
          "p",
          "quizcart-help",
          "More products that fit your profile.",
        );
        paintProducts(card, state, more, false);
      }
    }
    const actions = element(card, "div", "quizcart-actions");
    button(actions, "Retake Quiz", () => showWelcome(root, state), "secondary");
  }

  function paintProducts(card, state, products, markBest) {
    const grid = element(card, "div", "quizcart-products");
    products.forEach((product, index) => {
      const article = element(grid, "article", "quizcart-product");
      if (markBest && index === 0)
        addText(article, "span", "quizcart-badge", "Best Match");
      if (product.imageUrl && product.imageUrl.startsWith("https://")) {
        const image = element(article, "img", "");
        image.src = product.imageUrl;
        image.alt = product.title;
      }
      const body = element(article, "div", "");
      addText(body, "h3", "", product.title);
      if (product.price) addText(body, "p", "", product.price);
      if (product.explanation)
        addText(body, "p", "quizcart-explain", product.explanation);
      if (product.variantId) {
        button(body, "Add to Cart", async (control) => {
          control.disabled = true;
          try {
            const id = Number(String(product.variantId).split("/").pop());
            const response = await fetch(
              `${window.Shopify?.routes?.root || "/"}cart/add.js`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: JSON.stringify({ items: [{ id, quantity: 1 }] }),
              },
            );
            if (!response.ok) throw new Error("Couldn't add that product.");
            trackProduct(state, "add_to_cart", product);
            control.textContent = "Added";
          } catch (error) {
            control.disabled = false;
            showError(card, error.message);
          }
        });
      } else {
        button(
          body,
          "View",
          () => {
            trackProduct(state, "product_clicked", product);
            window.location.href = `${window.Shopify?.routes?.root || "/"}products/${encodeURIComponent(product.handle)}`;
          },
          "secondary",
        );
      }
    });
  }

  function trackProduct(state, eventType, product) {
    request("/event", {
      method: "POST",
      body: {
        sessionId: state.sessionId,
        eventType,
        metadata: { productId: product.handle, title: product.title },
      },
    }).catch(() => {});
  }

  function visibleQuestions(quiz, responses) {
    const visible = [];
    const active = [];
    for (const question of [...quiz.questions].sort(
      (a, b) => a.position - b.position,
    )) {
      if (!isVisible(question.id, quiz.rules, active)) continue;
      visible.push(question);
      const response = responses.find(
        (item) => item.questionId === question.id,
      );
      if (response) active.push(response);
    }
    return visible;
  }

  function isVisible(questionId, rules, responses) {
    const targeting = rules.filter(
      (rule) => rule.action === "show" && rule.targetQuestionId === questionId,
    );
    if (targeting.length === 0) return true;
    return targeting.some((rule) => {
      const checks = (rule.conditions || []).map((condition) => {
        const response = responses.find(
          (item) => item.questionId === condition.questionId,
        );
        return Boolean(response?.answerIds.includes(condition.answerId));
      });
      if (!checks.length) return false;
      return rule.match === "any"
        ? checks.some(Boolean)
        : checks.every(Boolean);
    });
  }

  async function request(path, options = {}) {
    const response = await fetch(`${ENDPOINT}${path}`, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function collectsInfo(state) {
    const fields = state.quiz.customer || {};
    return Boolean(fields.collectName || fields.collectAge);
  }

  function stepRow(card, current, total, onBack) {
    const maximum = Math.max(total, 1);
    const step = Math.min(Math.max(current, 1), maximum);
    const row = element(card, "div", "quizcart-top");
    if (onBack) {
      const back = button(row, "\u2190", onBack, "back");
      back.setAttribute("aria-label", "Go back");
    }
    const progress = element(row, "div", "quizcart-progress");
    const label = element(progress, "div", "quizcart-progress-label");
    const stepLabel = element(label, "span", "quizcart-step-label");
    addText(stepLabel, "b", "", String(step).padStart(2, "0"));
    const copy = addText(stepLabel, "span", "", "YOUR PROGRESS");
    addText(copy, "small", "", "Step " + step + " of " + maximum);
    const percent = addText(label, "span", "quizcart-progress-percent", String(Math.round(step / maximum * 100)));
    addText(percent, "small", "", "%");
    const track = element(progress, "div", "quizcart-progress-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "Quiz progress");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(maximum));
    track.setAttribute("aria-valuenow", String(step));
    for (let index = 0; index < maximum; index++) {
      const segment = element(track, "span", index < step ? "is-filled" : "");
      segment.setAttribute("aria-hidden", "true");
    }
  }

  function cardShell(root, branded, position) {
    root.replaceChildren();
    root.removeAttribute("aria-busy");
    applyTheme(root, root.quizcartTheme);
    const card = element(
      root,
      "div",
      `quizcart-card ${branded ? "is-branded" : "is-step"}`,
    );
    card.setAttribute("aria-live", "polite");
    const previous = root.quizcartPosition;
    if (position !== undefined) {
      root.quizcartPosition = position;
      if (previous !== undefined && previous !== position) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!reduced) card.animate([
          { opacity: 0, transform: position > previous ? "translateY(32px)" : "translateY(-32px)" },
          { opacity: 1, transform: "translateY(0)" },
        ], { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
        requestAnimationFrame(() => {
          root.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start", inline: "nearest" });
        });
      }
    }
    {
      const brand = element(card, "div", "quizcart-brand");
      if (root.dataset?.logoUrl) {
        const logo = element(brand, "img", "quizcart-logo");
        logo.src = root.dataset.logoUrl;
        logo.alt = "QuizCart";
        logo.width = 96;
        logo.height = 96;
      } else {
        addText(brand, "span", "", "QuizCart");
      }
    }
    return card;
  }

  function renderMessage(root, heading, message) {
    const card = cardShell(root, heading);
    addText(card, "p", "", message);
  }

  function applyTheme(root, appearance) {
    if (!appearance) return;
    root.style.setProperty("--qc-primary", appearance.primaryColor);
    root.style.setProperty("--qc-accent", appearance.accentColor);
    root.style.setProperty("--qc-bg", appearance.backgroundColor);
    root.style.setProperty("--qc-text", appearance.textColor);
    root.style.setProperty("--qc-radius", `${appearance.buttonRadius}px`);
    root.style.setProperty("--qc-font", appearance.fontFamily || "inherit");
    root.style.setProperty("--qc-on-accent", "#ffffff");
    if (appearance.matchStoreColors) matchStoreColors(root);
    const parentStyle = root.parentElement ? getComputedStyle(root.parentElement) : null;
    if (parentStyle) {
      if (appearance.matchStoreColors || !appearance.fontFamily || appearance.fontFamily === "inherit") root.style.setProperty("--qc-font", parentStyle.fontFamily);
      root.style.setProperty("--qc-font-size", parentStyle.fontSize);
      root.style.setProperty("--qc-line-height", parentStyle.lineHeight);
    }
  }

  function matchStoreColors(root) {
    const parent = root.parentElement;
    if (!parent) return;
    const transparent = (value) => !value || value === "transparent" || /rgba\([^)]*,\s*0\s*\)$/.test(value);
    const candidates = Array.from(document.querySelectorAll('button[name="add"], .product-form__submit, .button--primary, .btn--primary, .button, .btn, button[type="submit"]'));
    const themeButton = candidates.find((node) => !node.closest(".quizcart-root") && node.getBoundingClientRect().width > 0 && !transparent(getComputedStyle(node).backgroundColor));
    const buttonStyle = themeButton ? getComputedStyle(themeButton) : null;
    const styles = [getComputedStyle(parent)];
    if (buttonStyle) styles.push(buttonStyle);
    styles.push(getComputedStyle(document.body), getComputedStyle(document.documentElement));
    function themeColor(names) {
      for (const style of styles) {
        for (const name of names) {
          const value = style.getPropertyValue(name).trim();
          if (!value) continue;
          const color = CSS.supports("color", value) ? value : CSS.supports("color", "rgb(" + value + ")") ? "rgb(" + value + ")" : null;
          if (color && !transparent(color)) return color;
        }
      }
      return null;
    }
    let background = themeColor(["--color-background", "--color-background-primary", "--color-bg"]);
    for (let node = parent; !background && node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (!transparent(color)) background = color;
    }
    const text = themeColor(["--color-foreground", "--color-text", "--color-text-primary"]) || styles[0].color;
    const accent = buttonStyle?.backgroundColor || themeColor(["--color-button", "--color-primary", "--color-accent", "--color-btn-primary"]);
    const onAccent = buttonStyle?.color || themeColor(["--color-button-text", "--color-btn-primary-text"]);
    if (background) root.style.setProperty("--qc-bg", background);
    if (text) {
      root.style.setProperty("--qc-text", text);
      root.style.setProperty("--qc-primary", text);
    }
    if (accent) root.style.setProperty("--qc-accent", accent);
    if (onAccent) root.style.setProperty("--qc-on-accent", onAccent);
  }

  function showError(card, message) {
    let node = card.querySelector(".quizcart-error");
    if (!node) node = addText(card, "p", "quizcart-error", message);
    else node.textContent = message;
  }

  function field(form, label, type, name, placeholder) {
    const wrap = element(form, "label", "quizcart-field");
    addText(wrap, "span", "", label);
    const input = element(wrap, "input", "");
    input.type = type;
    input.name = name;
    input.placeholder = placeholder;
    input.autocomplete = name === "name" ? "name" : "off";
    if (type === "number") {
      input.min = "1";
      input.max = "120";
      input.inputMode = "numeric";
    }
    return input;
  }

  function ageRangeField(form, ranges = []) {
    const wrap = element(form, "label", "quizcart-field");
    addText(wrap, "span", "", "Your Age");
    const select = element(wrap, "select", "");
    select.name = "ageRange";
    select.autocomplete = "off";
    const placeholder = element(select, "option", "");
    placeholder.value = "";
    placeholder.textContent = "Select your age range";
    placeholder.selected = true;
    ranges.forEach((range) => {
      const option = element(select, "option", "");
      option.value = range;
      option.textContent = range;
    });
    return select;
  }

  function button(parent, label, onClick, variant) {
    const className =
      variant === "back"
        ? "quizcart-back"
        : variant
          ? `quizcart-button ${variant}`
          : "quizcart-button";
    const control = element(parent, "button", className);
    control.type = "button";
    control.textContent = label;
    if (onClick) control.addEventListener("click", () => onClick(control));
    return control;
  }

  function addText(parent, tag, className, text) {
    const node = element(parent, tag, className);
    node.textContent = text;
    return node;
  }

  function element(parent, tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    parent.append(node);
    return node;
  }
})();
