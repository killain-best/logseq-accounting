# Personal Finance

This context separates period cash flow from point-in-time household wealth so each can remain understandable and independently accurate.

## Language

**Transaction**:
An income or expense recorded on a journal day. It contributes to monthly cash-flow reports.
_Avoid_: Account movement, asset change

**Asset inventory**:
The user-facing activity of entering all known assets and liabilities at one point in time.
_Avoid_: Reconciliation, bookkeeping close

**Asset snapshot**:
An immutable result of one asset inventory, containing its timestamp and complete parent/child structure.
_Avoid_: Current balance, account ledger

**Side**:
One of asset or liability; liabilities are entered as positive amounts and subtracted when calculating net assets.

**Group**:
A user-managed parent category within one side, such as 流动资金 or 投资理财.
_Avoid_: Transaction category

**Item**:
A named child within a group, such as 微信 or 股票账户, with an amount recorded in each snapshot.
_Avoid_: Account

**Net assets**:
Total assets minus total liabilities in an asset snapshot.
