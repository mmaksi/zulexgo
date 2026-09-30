**Why:** every checkout looks up open orders by plate and VIN to warn about a duplicate; without an index that reads the whole table.
**Breaks without it:** nothing, at first; the check slows with every order ever stored.
**Live table:** safe; builds an index on rows that already exist, which briefly blocks writes on a large table (none is large yet).
