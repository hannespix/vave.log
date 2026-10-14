import { expect, type Locator, type Page } from '@playwright/test';
const container=(control:Locator)=>control.locator('xpath=ancestor::*[@data-select-value][1]');
export async function openChoice(control:Locator){await container(control).locator('.vave-select__control').click();}
export async function expectChoiceValue(control:Locator,value:string){await expect(container(control)).toHaveAttribute('data-select-value',value);}
/** Resolve the expected value's label, then interact exclusively with the custom UI. */
export async function chooseValue(page:Page,control:Locator,value:string){
 const label=await container(control).locator('select option').evaluateAll((options,value)=>options.find(o=>(o as HTMLOptionElement).value===value)?.textContent??'',value);
 expect(label).not.toBe('');await openChoice(control);
 if(await container(control).getAttribute('data-searchable')==='true')await control.fill(label);
 const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 await page.getByRole('option',{name:new RegExp(`^${escaped}(?:\\s|$)`)}).click();
}
