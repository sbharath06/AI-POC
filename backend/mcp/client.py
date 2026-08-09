import os
import sys
import json
import asyncio
from typing import Dict, Any, List, Optional
from mcp.client.session import ClientSession
from mcp.client.stdio import stdio_client, StdioServerParameters

class MCPToolManager:
    def __init__(self):
        self.servers: Dict[str, ClientSession] = {}
        self._contexts = []

    async def connect_to_server(self, server_script_path: str):
        server_name = os.path.basename(server_script_path).split('.')[0]
        server_params = StdioServerParameters(
            command=sys.executable,
            args=[server_script_path]
        )
        try:
            stdio_ctx = stdio_client(server_params)
            read, write = await stdio_ctx.__aenter__()
            self._contexts.append(stdio_ctx)
            
            session = ClientSession(read, write)
            await session.__aenter__()
            self._contexts.append(session)
            
            await session.initialize()
            self.servers[server_name] = session
            print(f"Connected to MCP server: {server_name}")
        except Exception as e:
            print(f"Failed to connect to MCP server {server_name}: {e}")

    async def list_tools(self) -> List[Dict[str, Any]]:
        all_tools = []
        for server_name, session in self.servers.items():
            try:
                tools_response = await session.list_tools()
                for tool in tools_response.tools:
                    all_tools.append({
                        "server": server_name,
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.inputSchema
                    })
            except Exception as e:
                print(f"Error listing tools for {server_name}: {e}")
        return all_tools

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> str:
        for server_name, session in self.servers.items():
            try:
                tools_response = await session.list_tools()
                for tool in tools_response.tools:
                    if tool.name == tool_name:
                        result = await session.call_tool(tool_name, arguments)
                        # the result object structure depends on mcp version, let's extract text safely
                        content = result.content
                        if content and len(content) > 0:
                            return content[0].text
                        return "Tool executed but returned no text."
            except Exception as e:
                pass
        return f"Error: Tool {tool_name} not found or execution failed."

    async def process_with_tools(self, query: str, llm_provider) -> Optional[str]:
        # Simple heuristic to trigger tools for demonstration
        query_lower = query.lower()
        if "search" in query_lower or "lookup" in query_lower:
            # We would normally use LLM to pick the tool. For now, simple fallback
            if "wikipedia" in query_lower:
                topic = query.replace("wikipedia", "").replace("search", "").replace("lookup", "").strip()
                return await self.call_tool("wikipedia_summary", {"topic": topic})
            else:
                return await self.call_tool("web_search", {"query": query})
        elif "time" in query_lower:
            return await self.call_tool("get_current_time", {})
        elif "date" in query_lower:
            return await self.call_tool("get_current_date", {})
        elif "calculate" in query_lower or "+" in query_lower or "-" in query_lower or "*" in query_lower:
            # this is a bit too naive, but for now it'll do. 
            pass
        return None

    async def cleanup(self):
        for ctx in reversed(self._contexts):
            try:
                await ctx.__aexit__(None, None, None)
            except Exception:
                pass

mcp_manager = MCPToolManager()
