(() => {
  'use strict';
  const form = document.querySelector('#inquiry-form');
  if (!form) return;
  const fields = form.querySelector('fieldset');
  const button = form.querySelector('[type="submit"]');
  const status = document.querySelector('#inquiry-status');
  const plan = document.querySelector('#inquiry-plan');
  const website = document.querySelector('#inquiry-website');
  let pending = false;
  let submitted = false;
  document.querySelectorAll('[data-plan]').forEach(link => {
    link.addEventListener('click', () => {
      if (!pending && !submitted) plan.value = link.dataset.plan;
    });
  });
  website.addEventListener('blur', () => {
    const value = website.value.trim();
    if (value && !/^[a-z][a-z\d+.-]*:/i.test(value)) website.value = `https://${value}`;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || submitted || !form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    if (values._honey) return;
    values._subject = `Blue Jay inquiry — ${values.plan}`;
    pending = true;
    fields.disabled = true;
    form.setAttribute('aria-busy', 'true');
    button.textContent = 'Sending…';
    status.textContent = '';
    status.className = 'inquiry-status';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(form.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(values),
        signal: controller.signal
      });
      const result = await response.json();
      const accepted = result.success === true || result.success === 'true';
      const needsActivation = /activat|confirm your email/i.test(String(result.message || ''));
      if (!response.ok || !accepted || needsActivation) throw new Error('Submission not confirmed');
      submitted = true;
      form.reset();
      fields.hidden = true;
      status.classList.add('is-success');
      status.textContent = 'Thanks — your request has been submitted. Joshua will reply to the email address you provided to discuss your product and next steps.';
    } catch (_) {
      status.classList.add('is-error');
      status.textContent = 'We couldn’t confirm delivery. Your details are still here. Please try again later, or use the email link beside this form.';
    } finally {
      clearTimeout(timeout);
      pending = false;
      fields.disabled = false;
      form.removeAttribute('aria-busy');
      button.textContent = 'Send review request ↗';
      status.focus();
    }
  });
})();
