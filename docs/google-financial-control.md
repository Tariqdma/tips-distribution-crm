# Google Sheets Financial Control

## الملف المعتمد

- الاسم: `Tips CRM — Financial Control`
- المعرّف: `1ug9gegbs8P_a0iHEpjhYzlac2fmHnEZljxnkedGydnU`
- الرابط: `https://docs.google.com/spreadsheets/d/1ug9gegbs8P_a0iHEpjhYzlac2fmHnEZljxnkedGydnU/edit`
- الغرض: مصدر مالي يدخله المحاسب ويقرأه Tips CRM؛ لا ينشئ CRM الفواتير ولا يحرر الرصيد المالي.

## الأوراق والرؤوس

| الورقة | الغرض | المعرّفات الأساسية |
|---|---|---|
| `Customers` | ربط أكواد العملاء بالجهات | `Customer_Code`, `CRM_Account_ID` |
| `Invoices` | الفواتير والأرصدة المفتوحة | `Invoice_Number`, `Customer_Code`, `Open_Balance` |
| `Collections` | الدفعات المعتمدة | `Receipt_Reference`, `Invoice_Number`, `Customer_Code` |
| `Reconciliation` | مطابقة الخزينة أو البنك | `Receipt_Reference`, `Reconciliation_Status`, `Deposit_Reference` |
| `Import_Log` | أثر تدقيق الاستيراد | `Import_Batch_ID`, `Source_File`, `Status` |
| `Readme` | قواعد الإدخال والتحكم | حالات الاعتماد والمطابقة |

## قواعد التكامل

1. `Customer_Code` هو مفتاح الربط الثابت ولا يعتمد على اسم العميل.
2. المحاسب هو من يحرر الفواتير والأرصدة والتحصيلات في الملف أو يحدّثها من المصدر المحاسبي.
3. Tips CRM يستخدم حساب خدمة Google للقراءة فقط.
4. لا تُحتسب المطابقة أو العمولة إلا للدفعات ذات حالة اعتماد ومطابقة مناسبة.
