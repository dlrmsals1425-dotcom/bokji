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
  {program:'g51110.gov24-418000000243',form:'ordin-18422495',format:'hwp'},
  {program:'g41590.gov24-O00058400003',form:'ordin-21451325',format:'hwp',title:'입사원서 · 개인정보 수집·이용 동의서',instructions:'별지 제1호 입사원서와 제4호 개인정보 동의서만 작성합니다.'},
  {program:'g52190.bokjiro-WLF00003477',form:'ordin-20097253',format:'hwp',title:'임대보증금 무이자지원 신청서',instructions:'국민임대주택 입주 대상자가 남원시장에게 신규 지원을 신청할 때 사용합니다.'},
  {program:'g44800.gov24-460000000141',form:'ordin-21772917',format:'hwp',title:'(참전, 보훈)수당지급대상자 등록신청서',instructions:'홍성 참전명예·보훈명예 또는 해당 배우자수당 등록신청 항목에 사용. 사망위로금은 별도 별지4.'},
  {program:'g11740.gov24-324000000106',form:'ordin-20804835',format:'hwpx',title:'입학축하금 신청서',instructions:'파일 중 별지4 입학축하금 신청서만 사용합니다.'},
  {program:'g28200.gov24-353000000108',form:'ordin-22713591',format:'hwpx',title:'참전유공자 배우자수당 지급신청서',instructions:'사망한 참전유공자의 65세 이상 법률상 배우자가 남동구에 거주하며 배우자 월수당을 신청하는 경우만 사용합니다.'},
]) test(`real ${sample.form} ${sample.format} downloads with original bytes @mobile`,async({page})=>{
  await page.goto(`/p/${sample.program}`);
  const button=page.getByTestId('application-forms').locator(`a[download][href="${catalog.forms[sample.form].file!.hwp}"]`);
  await expect(button).toContainText(sample.format.toUpperCase());
  await expect(button).toHaveAttribute('href',catalog.forms[sample.form].file!.hwp);
  if(sample.title) await expect(button).toHaveAttribute('download',sample.title+'.'+sample.format);
  if(sample.municipality) await expect(page.getByTestId('application-forms').getByText(sample.municipality+' 방문 접수용',{exact:true})).toBeVisible();
  if(sample.instructions) await expect(page.getByTestId('application-forms')).toContainText(sample.instructions);
  const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${sample.format}$`));
  const file=await download.path();expect(file).toBeTruthy();
  expect(createHash('sha256').update(readFileSync(file!)).digest('hex')).toBe(catalog.forms[sample.form].file!.sha256);
});
