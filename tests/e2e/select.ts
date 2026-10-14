import type {Locator} from '@playwright/test';
/** Opens a SelectMenu combobox and picks an option, optionally narrowing the list with its search box first. */
export async function pickOption(combobox:Locator,option:string|RegExp,search?:string){
 const page=combobox.page();
 await combobox.click();
 if(search)await page.locator('.sm-search input').fill(search);
 await page.getByRole('option',{name:option,exact:typeof option==='string'}).click();
}
