from mcp.server.fastmcp import FastMCP
from datetime import datetime
import ast
import operator

mcp = FastMCP("system_tools")

@mcp.tool()
def get_current_time() -> str:
    """Returns the current local time."""
    return datetime.now().strftime("%I:%M:%S %p")

@mcp.tool()
def get_current_date() -> str:
    """Returns the current local date."""
    return datetime.now().strftime("%Y-%m-%d")

@mcp.tool()
def calculate(expression: str) -> str:
    """Safely evaluates a mathematical expression."""
    allowed_operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.BitXor: operator.xor,
        ast.USub: operator.neg
    }

    def eval_expr(node):
        if isinstance(node, ast.Constant):
            return node.value
        elif isinstance(node, ast.BinOp):
            return allowed_operators[type(node.op)](eval_expr(node.left), eval_expr(node.right))
        elif isinstance(node, ast.UnaryOp):
            return allowed_operators[type(node.op)](eval_expr(node.operand))
        else:
            raise TypeError(node)

    try:
        parsed = ast.parse(expression, mode='eval').body
        result = eval_expr(parsed)
        return str(result)
    except Exception as e:
        return f"Error evaluating expression: {str(e)}"

if __name__ == "__main__":
    mcp.run()
