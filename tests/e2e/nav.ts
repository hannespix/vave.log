import type {Page} from '@playwright/test';
/** Opens a main-navigation area. On phones the secondary areas (Reports, Team, Finance, Settings, Help) live behind the "More" sheet, so the helper goes through that sheet there. The mobile check reads the always-rendered "More" button, not the target item — Team/Finance only appear once the workspace data has loaded, and the click below auto-waits for that. */
export async function goArea(page:Page,name:string){
 const nav=page.getByRole('navigation').first();
 await nav.waitFor();
 const more=page.locator('.nav-more');
 if(await more.isVisible()){
  await more.click();
  await page.locator('.nav-more-sheet').getByRole('button',{name,exact:true}).click();
  return;
 }
 await nav.getByRole('button',{name,exact:true}).click();
}
