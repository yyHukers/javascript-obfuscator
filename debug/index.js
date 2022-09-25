import JavaScriptObfuscator from "./../index.ts";

var obfuscationResult = JavaScriptObfuscator.obfuscate(
  `
    var test = 31;
    var test2 = 32;
    var test3 = function() {};
    // var test4 = 'abc'; 
  `,
  {
    compact: false,
    controlFlowFlattening: true,
    // controlFlowFlatteningThreshold: 1,
    // numbersToExpressions: true,
    simplify: true,
    stringArrayShuffle: true,
    splitStrings: true,
    stringArrayThreshold: 1,
    // deadCodeInjection: false,
    // deadCodeInjectionThreshold: 0.3,
  }
);

console.log(obfuscationResult.getObfuscatedCode());
