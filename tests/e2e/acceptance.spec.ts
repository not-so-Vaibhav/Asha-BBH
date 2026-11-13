import {test,expect,type Page} from '@playwright/test';

async function openVisit(page:Page,id='BEN-1001'){
 await page.goto('/');
 await page.getByRole('button',{name:new RegExp(id)}).click();
}
test('normal visit: five fields, spoken read-back panel, one-field correction, save, follow-up, and map coverage',async({page})=>{
 await openVisit(page);
 await page.getByRole('button',{name:/Normal visit/}).click();
 await expect(page.getByText(/Aaj mi Sunita cha ANC follow-up visit ghetla/)).toBeVisible({timeout:7000});
 await expect(page.getByText('Beneficiary ID',{exact:true})).toBeVisible();
 await expect(page.getByText('55 kg',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('None reported',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('20 November',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('button',{name:/Confirm & save/})).toBeVisible();
 await page.getByRole('button',{name:/Correct field/}).click();
 await page.getByRole('button',{name:'No, weight is 56 kilo'}).click();
 await expect(page.getByText('56 kg',{exact:true}).first()).toBeVisible();
 await expect(page.getByText(/55 kg.*56 kg/)).toBeVisible();
 await expect(page.getByText('20 November',{exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:/Confirm & save/}).click();
 await expect(page.getByRole('heading',{name:'Record saved'})).toBeVisible();
 await page.locator('.bottom').getByRole('button',{name:'Home'}).click();
 await expect(page.getByText('1 / 5',{exact:true})).toBeVisible();
 await page.locator('.bottom').getByRole('button',{name:'Follow-ups'}).click();
 await expect(page.getByText(/2026-11-20/)).toBeVisible();
 await page.locator('.bottom').getByRole('button',{name:'Map'}).click();
 await expect(page.getByText('Sample geography, not real boundaries')).toBeVisible();
 await expect(page.getByText('50% Completed')).toBeVisible();
});
test('emergency interrupts before read-back, creates referral, opens highlighted sample PHC, and saves danger flag',async({page})=>{
 await openVisit(page);
 await page.getByRole('button',{name:/Emergency/}).click();
 const alert=page.getByRole('alertdialog');
 await expect(alert).toBeVisible();
 await expect(alert.getByText(/PREG-01/)).toBeVisible();
 await expect(alert.getByText('Pending review')).toBeVisible();
 await expect(alert.getByText(/Sample PHC North/)).toBeVisible();
 await alert.getByRole('button',{name:/Show nearest PHC/}).click();
 await expect(page.getByText('Sample PHC North')).toBeVisible();
 await expect(page.getByText('Sample facility · 1.8 km')).toBeVisible();
 await page.getByRole('button',{name:/Back to draft/}).click();
 await expect(page.getByText(/Danger sign/).first()).toBeVisible();
 await page.getByRole('button',{name:/Confirm & save/}).click();
 await expect(page.getByText(/Danger sign/).first()).toBeVisible();
 await page.locator('.bottom').getByRole('button',{name:'Referrals'}).click();
 await expect(page.getByText(/PREG-01/)).toBeVisible();
 await expect(page.getByText(/Pregnant woman la bleeding hot aahe/)).toBeVisible();
});
test('clear pregnancy negation stays quiet and ambiguous report is recall-first',async({page})=>{
 await openVisit(page);
 await page.getByRole('button',{name:/No bleeding/}).click();
 await expect(page.getByText('No bleeding reported.')).toBeVisible({timeout:7000});
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 await page.getByRole('button',{name:/Maybe bleeding/}).click();
 const alert=page.getByRole('alertdialog');
 await expect(alert).toBeVisible();
 await expect(alert.getByText(/review needed/)).toBeVisible();
});
test('language selector changes UI and emergency wording to Hindi and Marathi',async({page})=>{
 await page.goto('/');
 await page.getByLabel('Language').selectOption('hi');
 await expect(page.getByRole('heading',{name:/नमस्ते/})).toBeVisible();
 await page.getByRole('button',{name:/BEN-1001/}).click();
 await page.getByRole('button',{name:/Emergency/}).click();
 await expect(page.getByRole('alertdialog').getByText(/पूर्वनिर्धारित खतरे/)).toBeVisible();
 await page.getByRole('alertdialog').getByRole('button',{name:'रद्द करें'}).click();
 await page.locator('.bottom').getByRole('button',{name:'Home'}).click();
 await page.getByLabel('Language').selectOption('mr');
 await expect(page.getByRole('heading',{name:/नमस्कार/})).toBeVisible();
});
test('newborn high fever and not feeding creates NB-01 and NB-03 only for newborn',async({page})=>{
 await openVisit(page,'BEN-1002');
 await page.getByRole('button',{name:/Newborn concern/}).click();
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await expect(page.getByRole('alertdialog').getByText(/NB-01/)).toBeVisible();
 await page.getByRole('alertdialog').getByRole('button',{name:/Back to draft/}).click();
 await page.locator('.bottom').getByRole('button',{name:'Referrals'}).click();
 await expect(page.getByText(/NB-01/)).toBeVisible();
 await expect(page.getByText(/NB-03/)).toBeVisible();
});
