(function(){
  window.FP = window.FP || {};
  window.FP.Modules = window.FP.Modules || {};
  
  const CalculatorModule = {
    render() {
      return `
        <div class="max-w-3xl mx-auto">
          <div class="fp-card bg-black text-white p-4 border border-slate-800">
            <div id="calcDisplay" class="text-right text-5xl font-light p-4 select-none">0</div>

            <div class="grid grid-cols-4 gap-3 p-2">
              ${btn("AC","fn")} ${btn("+/-","fn")} ${btn("%","fn")} ${btn("÷","op")}
              ${btn("7")} ${btn("8")} ${btn("9")} ${btn("×","op")}
              ${btn("4")} ${btn("5")} ${btn("6")} ${btn("−","op")}
              ${btn("1")} ${btn("2")} ${btn("3")} ${btn("+","op")}
              ${btn("0","zero")} ${btn(".")} ${btn("=","eq")}
            </div>
          </div>
        </div>
      `;

      function btn(label, kind="num") {
        const base = "h-16 rounded-full text-xl font-medium active:opacity-80 select-none";
        const cls =
          kind === "op" ? `${base} bg-orange-500 text-white` :
          kind === "eq" ? `${base} bg-orange-500 text-white col-span-1` :
          kind === "fn" ? `${base} bg-slate-300 text-black` :
          kind === "zero" ? `${base} bg-slate-700 text-white col-span-2 text-left pl-7` :
          `${base} bg-slate-700 text-white`;

        return `<button class="calc-btn ${cls}" data-kind="${kind}" data-label="${label}">${label}</button>`;
      }
    },

    mount(root) {
      const display = root.querySelector("#calcDisplay");

      let current = "0";
      let prev = null;
      let op = null;
      let resetNext = false;

      const setDisplay = (v) => {
        current = String(v);
        display.textContent = current.length > 10 ? Number(current).toExponential(4) : current;
      };

      const apply = (a, b, oper) => {
        const x = Number(a);
        const y = Number(b);
        if (oper === "+") return x + y;
        if (oper === "−") return x - y;
        if (oper === "×") return x * y;
        if (oper === "÷") return y === 0 ? NaN : x / y;
        return y;
      };

      const onNum = (d) => {
        if (resetNext) {
          setDisplay(d === "." ? "0." : d);
          resetNext = false;
          return;
        }
        if (d === ".") {
          if (!current.includes(".")) setDisplay(current + ".");
          return;
        }
        if (current === "0") setDisplay(d);
        else setDisplay(current + d);
      };

      const onOp = (newOp) => {
        if (op && prev !== null && !resetNext) {
          const res = apply(prev, current, op);
          prev = String(res);
          setDisplay(prev);
        } else {
          prev = current;
        }
        op = newOp;
        resetNext = true;
      };

      const onEq = () => {
        if (!op || prev === null) return;
        const res = apply(prev, current, op);
        setDisplay(String(res));
        prev = null;
        op = null;
        resetNext = true;
      };

      const onFn = (label) => {
        if (label === "AC") {
          current = "0"; prev = null; op = null; resetNext = false;
          setDisplay("0");
        } else if (label === "+/-") {
          setDisplay(String(Number(current) * -1));
        } else if (label === "%") {
          setDisplay(String(Number(current) / 100));
        }
      };

      root.querySelectorAll(".calc-btn").forEach(b => {
        b.addEventListener("click", () => {
          const kind = b.getAttribute("data-kind");
          const label = b.getAttribute("data-label");
          if (kind === "num" || kind === "zero") onNum(label);
          else if (kind === "op") onOp(label);
          else if (kind === "eq") onEq();
          else if (kind === "fn") onFn(label);
        });
      });
    }
  };

  window.FP.Modules["CalculatorModule"] = CalculatorModule;
})();