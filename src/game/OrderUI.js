import { RECIPES } from './RecipeSystem.js';
import { ORDER_STATES, patienceLevel } from './OrderSystem.js';
import { recipeIngredients, createRecipeIllustration } from './RecipePresentation.js';

const ANIMAL_NAMES = { rabbit: 'Coelhinho', bear: 'Ursinho', panda: 'Panda' };

export class OrderUI {
  constructor(container) {
    this.container = container; this.entries = new Map(); this.retiring = new Set();
    this.root = container.ownerDocument.createElement('aside'); this.root.className = 'order-panel';
    this.root.setAttribute('aria-label', 'Pedidos dos clientes'); this.root.hidden = true;
    container.appendChild(this.root);
  }

  create(order, customer) {
    for (const node of this.retiring) {
      if (this.root.children.length < 3) break;
      node.remove(); this.retiring.delete(node);
    }
    const document = this.container.ownerDocument;
    const element = (tag, className) => { const node = document.createElement(tag); node.className = className; return node; };
    const bubble = element('article', 'order-card');
    bubble.dataset.orderId = order.id; bubble.dataset.customerId = order.customerId;
    const badge = element('div', 'order-new'); badge.textContent = 'Novo pedido!';
    badge.setAttribute('role', 'status');
    const portrait = element('div', 'customer-portrait'); portrait.dataset.animal = customer.type;
    portrait.setAttribute('role', 'img'); portrait.setAttribute('aria-label', ANIMAL_NAMES[customer.type]);
    for (const part of ['ear left', 'ear right', 'face', 'eye left', 'eye right', 'nose']) portrait.appendChild(element('span', part));
    const animal = element('div', 'order-animal'); animal.textContent = ANIMAL_NAMES[customer.type];
    const recipe = RECIPES.find(recipe => recipe.id === order.recipeId);
    const icon = createRecipeIllustration(document, recipe);
    const name = element('div', 'order-name'); name.textContent = order.recipeName;
    const tutorial = element('div', 'order-ingredients'); tutorial.textContent = recipeIngredients(recipe);
    const track = element('div', 'order-patience'); track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', `Paciência: ${order.recipeName}`); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '100');
    const fill = element('div', 'order-patience-fill'); track.appendChild(fill);
    const time = element('div', 'order-time');
    bubble.append(badge, portrait, animal, icon, name, tutorial, track, time); this.root.appendChild(bubble);
    const entry = { bubble, badge, track, fill, time, initialRemaining: order.remainingTime };
    this.entries.set(order.id, entry); return entry;
  }

  update(orderSystem, customers) {
    const active = orderSystem.getActiveOrders().filter(order => customers.has(order.customerId)).slice(0, 3);
    const ids = new Set(active.map(order => order.id));
    for (const [id, entry] of this.entries) if (!ids.has(id)) {
      const order = orderSystem.getOrder(id);
      // Exibe o zero real antes de iniciar a saída; não deixa a barra no último quadro pendente.
      if (order?.state === ORDER_STATES.EXPIRED) this.renderOrder(entry, order);
      this.entries.delete(id); this.retiring.add(entry.bubble); entry.bubble.classList.add('is-leaving');
      entry.bubble.setAttribute('aria-hidden', 'true');
      entry.bubble.onanimationend = () => {
        entry.bubble.remove(); this.retiring.delete(entry.bubble);
        this.root.hidden = this.entries.size === 0 && this.retiring.size === 0;
      };
    }
    this.root.hidden = active.length === 0 && this.retiring.size === 0;
    for (const order of active) {
      const entry = this.entries.get(order.id) ?? this.create(order, customers.get(order.customerId));
      this.renderOrder(entry, order);
    }
  }

  renderOrder(entry, order) {
    const rawPercent = order.maxPatience > 0 ? order.remainingTime / order.maxPatience * 100 : 0;
    const percent = Number.isFinite(rawPercent) ? Math.min(100, Math.max(0, rawPercent)) : 0;
    const ratio = percent / 100;
    // A interface somente lê o pedido. O relógio continua pertencendo ao OrderSystem.
    entry.badge.hidden = order.state !== ORDER_STATES.PENDING || entry.initialRemaining - order.remainingTime >= 3;
    entry.bubble.dataset.level = patienceLevel(ratio);
    entry.fill.style.transform = `scaleX(${ratio})`;
    const value = String(Math.round(percent));
    if (entry.track.getAttribute('aria-valuenow') !== value) entry.track.setAttribute('aria-valuenow', value);
    const time = `${Math.ceil(Math.max(0, order.remainingTime))}s restantes`;
    if (entry.time.textContent !== time) entry.time.textContent = time;
  }

  dispose() { this.entries.clear(); this.retiring.clear(); this.root.remove(); }
}
