# Real-browser scenes, one file per piece of work

`node test/browser.js` loads every `*.js` here after its own scenes. Each file exports:

```js
module.exports = ({ scene, ok, eq, hex, path, fs, os }) => {
  scene('what a person does, in their words', async (page) => {
    await page.evaluate(() => OG.reset());
    // real pointer and keyboard events against the real canvas
    eq('the thing that must hold', got, want);
  });
};
```

One file per piece so parallel work never edits the same file. Drive the program
through real input (page.mouse, page.keyboard); use page.evaluate only to set a scene
up or to read the result back — never to perform the behaviour under test.
