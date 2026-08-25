const str = `
A[Volume (VEC)]
B(Volume (VEC))
C{Volume (VEC)}
D((Volume (VEC)))
`;

console.log(str.replace(/\{([^"\{\}\n]*?[\(\)<>]+[^"\{\}\n]*?)\}/g, '{"$1"}'));
console.log(str.replace(/\(([^"\(\)\n]*?[\(\)<>]+[^"\(\)\n]*?)\)/g, '("$1")'));
