const myURL = new URL('https://example.org/?abc=123');
myURL.searchParams.set('ok', '1')
myURL.searchParams.delete('abc')
console.log(myURL.toString())