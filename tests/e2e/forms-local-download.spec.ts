import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {FormsCatalog} from '../../src/lib/data/forms';

const catalog=JSON.parse(readFileSync('public/forms/v1/catalog.json','utf8')) as FormsCatalog;
for(const sample of [
  {program:'g41280.gov24-394000000111',form:'ordin-19969911',format:'hwp'},
  {program:'g11440.gov24-313000000145',form:'ordin-22517767',format:'hwpx'},
  {program:'g48240.gov24-O00013000002',form:'ordin-22140033',format:'hwp'},
  {program:'g26110.gov24-325000000249',form:'ordin-22750737',format:'hwpx'},
  {program:'g11350.gov24-310000000120',form:'ordin-21271589',format:'pdf'},
  {program:'g48270.gov24-O00012600001',form:'ordin-20291905',format:'gif'},
  {program:'g51720.bokjiro-WLF00002975',form:'ordin-19878599',format:'txt'},
  {program:'g47210.bokjiro-WLF00002245',form:'ordin-20973493',format:'hwp'},
  {program:'g52790.gov24-478000000120',form:'ordin-22409877',format:'hwp'},
  {program:'g51230.bokjiro-WLF00005579',form:'ordin-19201333',format:'hwp',title:'위임장(전입장려금 신청)'},
  {program:'s41000.gov24-641000000129',form:'ordin-20191135',format:'hwp',municipality:'안양시'},
  {program:'g41280.bokjiro-WLF00004751',form:'ordin-19996049',format:'hwp'},
  {program:'s27000.gov24-627000000108',form:'ordin-18151309',format:'hwp',municipality:'남구'},
]) test(`real ${sample.form} ${sample.format} downloads with original bytes @mobile`,async({page})=>{
  await page.goto(`/p/${sample.program}`);
  const button=page.getByTestId('application-forms').locator(`a[download][href="${catalog.forms[sample.form].file!.hwp}"]`);
  await expect(button).toContainText(sample.format.toUpperCase());
  await expect(button).toHaveAttribute('href',catalog.forms[sample.form].file!.hwp);
  if(sample.title) await expect(button).toHaveAttribute('download',sample.title+'.'+sample.format);
  if(sample.municipality) await expect(page.getByTestId('application-forms').getByText(sample.municipality+' 방문 접수용',{exact:true})).toBeVisible();
  const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${sample.format}$`));
  const file=await download.path();expect(file).toBeTruthy();
  expect(createHash('sha256').update(readFileSync(file!)).digest('hex')).toBe(catalog.forms[sample.form].file!.sha256);
});
