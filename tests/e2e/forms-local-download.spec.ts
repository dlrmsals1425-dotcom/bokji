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
]) test(`real ${sample.form} ${sample.format} downloads with original bytes @mobile`,async({page})=>{
  await page.goto(`/p/${sample.program}`);
  const button=page.getByTestId('application-forms').locator(`a[download][href="${catalog.forms[sample.form].file!.hwp}"]`);
  await expect(button).toContainText(sample.format.toUpperCase());
  await expect(button).toHaveAttribute('href',catalog.forms[sample.form].file!.hwp);
  const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${sample.format}$`));
  const file=await download.path();expect(file).toBeTruthy();
  expect(createHash('sha256').update(readFileSync(file!)).digest('hex')).toBe(catalog.forms[sample.form].file!.sha256);
});
