// 任务的异步阶段处理函数
function Step() {
  var steps = Array.prototype.slice.call(arguments),
      pending, counter, results, lock;

  function next() {
    counter = pending = 0;

    if (steps.length === 0) {
      if (arguments[0]) {
        throw arguments[0];
      }
      return;
    }

    var fn = steps.shift();
    results = [];

    try {
      lock = true;
      var result = fn.apply(next, arguments);
    } catch (e) {
      next(e);
    }

    if (counter > 0 && pending == 0) {
      next.apply(null, results);
    } else if (result !== undefined) {
      next(undefined, result);
    }
    lock = false;
  }

  // 并行，记录pending任务数 -> 结果记录在results list中
  next.parallel = function () {
    // counter: 计数器
    // 注册回调的时候索引值确保了返回值的顺序和执行顺序是一致的
    var index = 1 + counter++;
    pending++;

    return function () {
      pending--;
      if (arguments[0]) {
        results[0] = arguments[0];
      }
      results[index] = arguments[1];
      if (!lock && pending === 0) {
        next.apply(null, results);
      }
    };
  };

  next.group = function () {
    var localCallback = next.parallel();
    var counter = 0;
    var pending = 0;
    var result = [];
    var error = undefined;

    function check() {
      if (pending === 0) {
        // 利用parallel把group起来的结果作为参数
        // 即造成了parallel和group的不同
        // 分散的值和收集的值
        localCallback(error, result);
      }
    }
    process.nextTick(check); // Ensures that check is called at least once

    return function () {
      // index单独属于每一个循环自身的context的值
      var index = counter++;
      pending++;
      return function () {
        pending--;
        if (arguments[0]) {
          error = arguments[0];
        }
        result[index] = arguments[1];
        if (!lock) { check(); }
      };
    };
  };

  next();
}

Step.fn = function StepFn() {
  var steps = Array.prototype.slice.call(arguments);
  return function () {
    var args = Array.prototype.slice.call(arguments);

    var toRun = [function () {
      this.apply(null, args);
    }].concat(steps);

    if (typeof args[args.length-1] === 'function') {
      toRun.push(args.pop());
    }


    Step.apply(null, toRun);
  }
}


if (typeof module !== 'undefined' && "exports" in module) {
  module.exports = Step;
}

const fs = require('fs');
const path = require('path');

// 顺序执行
/*
Step(
  function readSelf() {
    fs.readFile(__filename, this);
  },
  function capitalize(err, text) {
    if (err) throw err;
    return text.toString().toUpperCase();
  },
  function showIt(err, newText) {
    if (err) throw err;
    console.log(newText);
  }
);
*/

// 同步执行
/*
Step(
  // Loads two files in parallel
  function loadStuff() {
    // 等待readFile的回调函数执行
    fs.readFile(__filename, this.parallel());
    fs.readFile("/etc/passwd", this.parallel());
  },
  // Show the result when done
  function showStuff(err, code, users) {
    if (err) throw err;
    console.log(code.toString());
    console.log(users.toString());
  }
)
*/

Step(
  function readDir() {
    // this: next函数作为readdir的回调函数
    fs.readdir(__dirname, this);
  },
  function readFiles(err, results) {
    if (err) throw err;
    // Create a new group
    var group = this.group();
    results.forEach(function (filename) {
      if (/\.js$/.test(filename)) {
        fs.readFile(__dirname + "/" + filename, 'utf8', group());
      }
    });
  },
  function showAll(err , files) {
    if (err) throw err;
    console.dir(files);
  }
);
