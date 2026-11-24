document.addEventListener('DOMContentLoaded', () => {
  const authPanel = document.getElementById('accountAuthPanel');
  const dashboard = document.getElementById('customerDashboard');
  const status = document.getElementById('accountStatus');
  const dashboardStatus = document.getElementById('dashboardStatus');
  const loginForm = document.getElementById('customerLoginForm');
  const sendButton = document.getElementById('sendMagicLinkBtn');

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.style.color = isError ? 'var(--danger, #ef4444)' : '';
  };

  async function showCustomerDashboard(user, claimedOrders = 0) {
    authPanel.hidden = true;
    dashboard.hidden = false;
    document.getElementById('customerIdentity').textContent = user.email || 'Sesión iniciada';
    document.getElementById('claimSummary').textContent = claimedOrders > 0
      ? `Se han vinculado ${claimedOrders} pedido(s) anterior(es) a esta cuenta.`
      : 'Tus pedidos vinculados aparecerán aquí.';
    dashboardStatus.textContent = 'Cargando tus pedidos…';

    const profileDetails = document.getElementById('customerProfileDetails');
    const list = document.getElementById('customerOrdersList');
    list.replaceChildren();

    try {
      const profile = await fetchCustomerProfile();
      const savedDetails = profile
        ? [profile.name, profile.phone, profile.address].filter(Boolean).join(' · ')
        : '';
      profileDetails.textContent = savedDetails || 'Todavía no hay datos de contacto guardados.';

      const orders = await fetchCustomerOrders();
      if (orders.length === 0) {
        dashboardStatus.textContent = 'Todavía no hay pedidos vinculados a esta cuenta.';
        return;
      }

      orders.forEach((order) => {
        const article = document.createElement('article');
        article.className = 'account-order';
        const title = document.createElement('strong');
        title.textContent = `Pedido ${order.order_code || order.id}`;
        const meta = document.createElement('p');
        meta.className = 'account-muted';
        meta.textContent = `${new Date(order.created_at).toLocaleString('es-ES')} · ${order.status || 'pendiente'} · ${order.delivery_method || 'entrega'}`;
        const total = document.createElement('p');
        total.textContent = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' })
          .format((Number(order.total_cents) || 0) / 100);
        article.append(title, meta, total);

        const items = document.createElement('ul');
        (Array.isArray(order.order_items) ? order.order_items : []).forEach((item) => {
          const li = document.createElement('li');
          li.textContent = `${item.quantity} × ${item.name}${item.variant ? ` — ${item.variant}` : ''}`;
          items.appendChild(li);
        });
        article.appendChild(items);
        list.appendChild(article);
      });
      dashboardStatus.textContent = '';
    } catch (error) {
      dashboardStatus.textContent = error.message || 'No se pudieron cargar tus pedidos.';
    }
  }

  async function initializeAccount() {
    try {
      const callback = await completeCustomerAuthRedirect();
      if (callback && callback.user) {
        await showCustomerDashboard(callback.user, Number(callback.claimedOrders) || 0);
        return;
      }

      if (readSupabaseSession()) {
        const user = await getCurrentUser();
        const claimed = await claimCustomerOrders();
        await showCustomerDashboard(user, Number(claimed) || 0);
      }
    } catch (error) {
      setStatus(error.message || 'No se pudo completar el acceso.', true);
    }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('customerEmail').value.trim().toLowerCase();
    const name = document.getElementById('customerName').value.trim();
    if (!email) return;

    sendButton.disabled = true;
    sendButton.textContent = 'Enviando…';
    try {
      await requestCustomerMagicLink(email, name, new URL('/account.html', window.location.origin).toString());
      setStatus('Te enviamos un enlace de acceso. Abre el correo y pulsa el enlace para verificar tu cuenta.');
    } catch (error) {
      setStatus(error.message || 'No se pudo enviar el enlace. Inténtalo más tarde.', true);
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = 'Enviar enlace de acceso';
    }
  });

  document.querySelectorAll('[data-provider]').forEach((button) => {
    button.addEventListener('click', () => {
      try {
        signInCustomerWithOAuth(button.dataset.provider, new URL('/account.html', window.location.origin).toString());
      } catch (error) {
        setStatus(error.message || 'No se pudo iniciar el acceso.', true);
      }
    });
  });

  document.getElementById('customerSignOut').addEventListener('click', async () => {
    await signOut();
    dashboard.hidden = true;
    authPanel.hidden = false;
    setStatus('Has cerrado sesión.');
  });

  initializeAccount();
});
