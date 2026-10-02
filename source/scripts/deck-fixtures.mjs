import assert from 'node:assert/strict';

export async function confirmStarterRestore(page, touch = false) {
  const dialog = page.getByRole('dialog',{name:'Restore starter deck?',exact:true});
  await dialog.waitFor();
  assert((await dialog.textContent()).includes('Are you sure you want to revert your deck back to a starter one?'));
  const confirm = dialog.getByRole('button',{name:'Yes, restore starter deck',exact:true});
  if (touch) await confirm.tap(); else await confirm.click();
  await dialog.waitFor({state:'detached'});
}
